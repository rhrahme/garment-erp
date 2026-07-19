import { NextResponse } from "next/server";
import { getCustomerInvoiceByIdFresh, saveCustomerInvoice } from "@/lib/data/customer-invoices";
import { recalculateInvoiceTotals } from "@/lib/invoicing/build-invoice";
import { resolveInvoiceLines } from "@/lib/invoicing/display";
import { applyCustomerInvoiceStatusChange } from "@/lib/invoicing/customer-invoice-mutations";
import { applySuitCombine } from "@/lib/invoicing/suit-combine-lines";
import {
  applyAllConsolidations,
  applyConsolidation,
} from "@/lib/invoicing/consolidate-lines";
import {
  applyAllInvoiceLineReductions,
  applyInvoiceLineReductionsByKeys,
} from "@/lib/invoicing/line-reduction-suggestions";
import type { CustomerInvoice, CustomerInvoiceLine, CustomerInvoiceStatus } from "@/lib/types/customer-invoices";
import { invalidateDocumentCache } from "@/lib/data/document-persistence";
import path from "path";
import { requireAuthenticated } from "@/lib/auth/session";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { canAccessSalesOrder } from "@/lib/sales/access";
import { redactCustomerInvoiceCosts } from "@/lib/auth/invoice-cost-access";
import { notifyIntegration } from "@/lib/integrations";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function normalizeText(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    invalidateDocumentCache(path.join(process.cwd(), "src/data/customer-invoices.json"));
    const { id } = await context.params;
    const invoice = await getCustomerInvoiceByIdFresh(id);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    const order = await getSalesOrderByIdFresh(invoice.sales_order_id);
    if (!order || !canAccessSalesOrder(session, order)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const resolved = { ...invoice, lines: resolveInvoiceLines(invoice.lines) };
    return NextResponse.json(session.isSalesOperator ? redactCustomerInvoiceCosts(resolved) : resolved);
  } catch (error) {
    console.error("Failed to read customer invoice:", error);
    return NextResponse.json({ error: "Failed to load invoice." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    invalidateDocumentCache(path.join(process.cwd(), "src/data/customer-invoices.json"));
    const { id } = await context.params;
    const invoice = await getCustomerInvoiceByIdFresh(id);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    const order = await getSalesOrderByIdFresh(invoice.sales_order_id);
    if (!order || !canAccessSalesOrder(session, order)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await request.json()) as {
      status?: CustomerInvoiceStatus;
      sent_at?: string | null;
      paid_at?: string | null;
      invoice_date?: string;
      due_date?: string | null;
      payment_terms?: string | null;
      notes?: string | null;
      client_email?: string | null;
      client_address?: string | null;
      vat_rate?: number | null;
      lines?: Array<Partial<CustomerInvoiceLine> & { id: string }>;
      consolidate?: { group_keys?: string[] } | "all";
      reduce_lines?: { group_keys?: string[] } | "all";
    };

    let next: CustomerInvoice = { ...invoice };

    if (body.invoice_date) next.invoice_date = body.invoice_date;
    if (body.due_date !== undefined) next.due_date = body.due_date;
    if (body.payment_terms !== undefined) next.payment_terms = normalizeText(body.payment_terms);
    if (body.notes !== undefined) next.notes = normalizeText(body.notes);
    if (body.client_email !== undefined) next.client_email = normalizeText(body.client_email);
    if (body.client_address !== undefined) next.client_address = normalizeText(body.client_address);

    if (body.vat_rate !== undefined) {
      const rate = body.vat_rate == null ? null : Number(body.vat_rate);
      next.vat_rate = rate != null && Number.isFinite(rate) && rate >= 0 ? rate : null;
    }

    if (body.reduce_lines) {
      if (body.reduce_lines === "all") {
        next.lines = resolveInvoiceLines(applyAllInvoiceLineReductions(invoice.lines));
      } else {
        const groupKeys = Array.isArray(body.reduce_lines.group_keys)
          ? body.reduce_lines.group_keys.filter((key) => typeof key === "string" && key.trim())
          : [];
        if (groupKeys.length === 0) {
          return NextResponse.json({ error: "No line reduction group keys provided." }, { status: 400 });
        }
        next.lines = resolveInvoiceLines(applyInvoiceLineReductionsByKeys(invoice.lines, groupKeys));
      }
      const totals = recalculateInvoiceTotals(next.lines, next.vat_rate);
      next = { ...next, ...totals };
    } else if (body.consolidate) {
      const groupKeys =
        body.consolidate === "all"
          ? undefined
          : Array.isArray(body.consolidate.group_keys)
            ? body.consolidate.group_keys.filter((key) => typeof key === "string" && key.trim())
            : [];
      if (body.consolidate !== "all" && groupKeys?.length === 0) {
        return NextResponse.json({ error: "No consolidation group keys provided." }, { status: 400 });
      }
      const afterSuitCombine = applySuitCombine(invoice.lines);
      next.lines = resolveInvoiceLines(
        body.consolidate === "all"
          ? applyAllConsolidations(afterSuitCombine)
          : applyConsolidation(afterSuitCombine, groupKeys!)
      );
      const totals = recalculateInvoiceTotals(next.lines, next.vat_rate);
      next = { ...next, ...totals };
    } else if (Array.isArray(body.lines)) {
      const isFullReplacement = body.lines.every(
        (row) =>
          row.id &&
          row.description != null &&
          row.quantity != null &&
          row.unit_price != null &&
          row.garment_type != null
      );

      if (isFullReplacement) {
        next.lines = resolveInvoiceLines(
          body.lines.map((row) => ({
            ...row,
            description: String(row.description).trim(),
            quantity: Number(row.quantity),
            unit_price: Number(row.unit_price),
          })) as CustomerInvoiceLine[]
        );
      } else {
        next.lines = resolveInvoiceLines(
          invoice.lines.map((line) => {
            const patch = body.lines!.find((row) => row.id === line.id);
            if (!patch) return line;
            const quantity = patch.quantity != null ? Number(patch.quantity) : line.quantity;
            const unitPrice = patch.unit_price != null ? Number(patch.unit_price) : line.unit_price;
            const description = patch.description != null ? String(patch.description).trim() : line.description;
            return {
              ...line,
              description,
              quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : line.quantity,
              unit_price: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : line.unit_price,
            };
          })
        );
      }
      const totals = recalculateInvoiceTotals(next.lines, next.vat_rate);
      next = { ...next, ...totals };
    } else if (body.vat_rate !== undefined) {
      const totals = recalculateInvoiceTotals(next.lines, next.vat_rate);
      next = { ...next, ...totals };
    }

    if (body.status) {
      const allowed: CustomerInvoiceStatus[] = ["draft", "sent", "paid"];
      if (!allowed.includes(body.status)) {
        return NextResponse.json({ error: "Invalid invoice status." }, { status: 400 });
      }

      const statusChanged = body.status !== invoice.status;
      const timestampsTouched = body.sent_at !== undefined || body.paid_at !== undefined;

      if (statusChanged || timestampsTouched) {
        const saved = await applyCustomerInvoiceStatusChange(
          { ...next, status: invoice.status },
          body.status,
          {
            sent_at: body.sent_at,
            paid_at: body.paid_at,
            source: "erp",
          }
        );
        invalidateDocumentCache(path.join(process.cwd(), "src/data/customer-invoices.json"));
        await notifyIntegration("invoice.updated", {
          id: saved.id,
          invoice_number: saved.invoice_number,
          status: saved.status,
          updated_by: session.email,
        });
        return NextResponse.json(session.isSalesOperator ? redactCustomerInvoiceCosts(saved) : saved);
      }

      next.status = body.status;
      if (body.sent_at !== undefined) next.sent_at = body.sent_at;
      if (body.paid_at !== undefined) next.paid_at = body.paid_at;
    } else {
      if (body.sent_at !== undefined) next.sent_at = body.sent_at;
      if (body.paid_at !== undefined) next.paid_at = body.paid_at;
    }

    const saved = await saveCustomerInvoice(next);
    await notifyIntegration("invoice.updated", {
      id: saved.id,
      invoice_number: saved.invoice_number,
      status: saved.status,
      updated_by: session.email,
    });
    invalidateDocumentCache(path.join(process.cwd(), "src/data/customer-invoices.json"));
    return NextResponse.json(session.isSalesOperator ? redactCustomerInvoiceCosts(saved) : saved);
  } catch (error) {
    console.error("Failed to update customer invoice:", error);
    return NextResponse.json({ error: "Failed to update invoice." }, { status: 500 });
  }
}
