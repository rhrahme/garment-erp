import { NextResponse } from "next/server";
import {
  getCustomerInvoiceSummary,
  listCustomerInvoicesSortedFromFile,
  readCustomerInvoicesFresh,
} from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { requireAuthenticated } from "@/lib/auth/session";
import { readSalesOrders } from "@/lib/data/sales-orders";
import { filterSalesOrdersForSession } from "@/lib/sales/access";
import { redactCustomerInvoiceCosts } from "@/lib/auth/invoice-cost-access";

export async function GET() {
  try {
    const session = await requireAuthenticated();
    if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    await ensureDocumentsLoaded(["customer_invoices", "sales_orders"]);
    const file = await readCustomerInvoicesFresh();
    const orderIds = new Set(
      filterSalesOrdersForSession(session, readSalesOrders().orders).map((order) => order.id)
    );
    const visibleFile = session.isSalesOperator
      ? {
          ...file,
          invoices: file.invoices
            .filter((invoice) => orderIds.has(invoice.sales_order_id))
            .map(redactCustomerInvoiceCosts),
        }
      : file;
    return NextResponse.json({
      ...visibleFile,
      invoices: listCustomerInvoicesSortedFromFile(visibleFile),
      summary: getCustomerInvoiceSummary(visibleFile),
    });
  } catch (error) {
    console.error("Failed to read customer invoices:", error);
    return NextResponse.json({ error: "Failed to load invoices." }, { status: 500 });
  }
}
