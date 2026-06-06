import { NextResponse } from "next/server";
import { getCustomerInvoiceById, saveCustomerInvoice } from "@/lib/data/customer-invoices";
import { readSalesOrders, writeSalesOrders } from "@/lib/data/sales-orders";
import { recalculateInvoiceTotals } from "@/lib/invoicing/build-invoice";
import type { CustomerInvoice, CustomerInvoiceLine, CustomerInvoiceStatus } from "@/lib/types/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";

function normalizeText(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDocumentsLoaded(["customer_invoices"]);
    const { id } = await context.params;
    const invoice = getCustomerInvoiceById(id);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    return NextResponse.json(invoice);
  } catch (error) {
    console.error("Failed to read customer invoice:", error);
    return NextResponse.json({ error: "Failed to load invoice." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDocumentsLoaded(["customer_invoices", "sales_orders"]);
    const { id } = await context.params;
    const invoice = getCustomerInvoiceById(id);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    const body = (await request.json()) as {
      status?: CustomerInvoiceStatus;
      invoice_date?: string;
      due_date?: string | null;
      payment_terms?: string | null;
      notes?: string | null;
      client_email?: string | null;
      client_address?: string | null;
      lines?: Array<Partial<CustomerInvoiceLine> & { id: string }>;
    };

    let next: CustomerInvoice = { ...invoice };

    if (body.invoice_date) next.invoice_date = body.invoice_date;
    if (body.due_date !== undefined) next.due_date = body.due_date;
    if (body.payment_terms !== undefined) next.payment_terms = normalizeText(body.payment_terms);
    if (body.notes !== undefined) next.notes = normalizeText(body.notes);
    if (body.client_email !== undefined) next.client_email = normalizeText(body.client_email);
    if (body.client_address !== undefined) next.client_address = normalizeText(body.client_address);

    if (Array.isArray(body.lines)) {
      next.lines = invoice.lines.map((line) => {
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
      });
      const totals = recalculateInvoiceTotals(next.lines);
      next = { ...next, ...totals };
    }

    if (body.status && body.status !== invoice.status) {
      const allowed: CustomerInvoiceStatus[] = ["draft", "sent", "paid"];
      if (!allowed.includes(body.status)) {
        return NextResponse.json({ error: "Invalid invoice status." }, { status: 400 });
      }
      next.status = body.status;
      if (body.status === "sent" && !next.sent_at) {
        next.sent_at = new Date().toISOString();
      }
      if (body.status === "paid" && !next.paid_at) {
        next.paid_at = new Date().toISOString();
        if (!next.sent_at) next.sent_at = next.paid_at;
      }

      if (body.status === "sent" || body.status === "paid") {
        const store = readSalesOrders();
        const orderIndex = store.orders.findIndex((order) => order.id === invoice.sales_order_id);
        if (orderIndex >= 0) {
          store.orders[orderIndex] = { ...store.orders[orderIndex]!, status: "complete" };
          await writeSalesOrders(store);
        }
      }
    }

    const saved = await saveCustomerInvoice(next);
    return NextResponse.json(saved);
  } catch (error) {
    console.error("Failed to update customer invoice:", error);
    return NextResponse.json({ error: "Failed to update invoice." }, { status: 500 });
  }
}
