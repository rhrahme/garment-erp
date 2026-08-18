import { NextResponse } from "next/server";
import {
  getCustomerInvoiceSummary,
  listCustomerInvoicesSortedFromFile,
  readCustomerInvoicesFresh,
} from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { requireAuthenticated } from "@/lib/auth/session";
import { readClients } from "@/lib/data/clients";
import { readSalesOrders } from "@/lib/data/sales-orders";
import { filterSalesOrdersForSession } from "@/lib/sales/access";
import {
  customerInvoiceForSession,
  redactCustomerInvoiceSummary,
} from "@/lib/auth/invoice-cost-access";
import { canViewMoney } from "@/lib/auth/invoice-amounts-access";

export async function GET() {
  try {
    const session = await requireAuthenticated();
    if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    await ensureDocumentsLoaded(["customer_invoices", "sales_orders", "clients"]);
    const file = await readCustomerInvoicesFresh();
    const orderIds = new Set(
      filterSalesOrdersForSession(session, readSalesOrders().orders, readClients().clients).map(
        (order) => order.id
      )
    );
    const scopedFile = session.isSalesOperator
      ? {
          ...file,
          invoices: file.invoices.filter((invoice) => orderIds.has(invoice.sales_order_id)),
        }
      : file;
    const invoices = listCustomerInvoicesSortedFromFile(scopedFile).map((invoice) =>
      customerInvoiceForSession(session, invoice)
    );
    const summary = getCustomerInvoiceSummary(scopedFile);
    return NextResponse.json({
      ...scopedFile,
      invoices,
      summary: canViewMoney(session) ? summary : redactCustomerInvoiceSummary(summary),
    });
  } catch (error) {
    console.error("Failed to read customer invoices:", error);
    return NextResponse.json({ error: "Failed to load invoices." }, { status: 500 });
  }
}
