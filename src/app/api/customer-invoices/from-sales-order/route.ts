import { NextResponse } from "next/server";
import { readCustomerInvoicesFresh } from "@/lib/data/customer-invoices";
import { getSalesOrdersByIdsFresh } from "@/lib/data/sales-orders";
import { createCustomerInvoiceFromSalesOrders } from "@/lib/invoicing/customer-invoice-mutations";
import { invoiceCoversSalesOrder } from "@/lib/invoicing/invoice-sales-orders";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { requireAuthenticated } from "@/lib/auth/session";
import { canAccessSalesOrder } from "@/lib/sales/access";
import { customerInvoiceForSession } from "@/lib/auth/invoice-cost-access";

function parseSalesOrderIds(body: { sales_order_id?: string; sales_order_ids?: string[] }): string[] {
  const listed = [
    ...(Array.isArray(body.sales_order_ids) ? body.sales_order_ids : []),
    body.sales_order_id ?? "",
  ];
  return [...new Set(listed.map((id) => String(id).trim()).filter(Boolean))];
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    await ensureDocumentsLoaded(["customer_invoices", "sales_orders", "costing_rates", "clients"]);

    const body = (await request.json()) as { sales_order_id?: string; sales_order_ids?: string[] };
    const salesOrderIds = parseSalesOrderIds(body);
    if (salesOrderIds.length === 0) {
      return NextResponse.json({ error: "sales_order_id is required." }, { status: 400 });
    }

    const orders = await getSalesOrdersByIdsFresh(salesOrderIds);
    if (orders.length !== salesOrderIds.length) {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }
    if (orders.some((order) => !canAccessSalesOrder(session, order))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const store = await readCustomerInvoicesFresh();
    const existing = store.invoices.find((invoice) =>
      salesOrderIds.some((id) => invoiceCoversSalesOrder(invoice, id))
    );
    if (existing) {
      return NextResponse.json(
        {
          error: "An invoice already exists for this sales order.",
          invoice: customerInvoiceForSession(session, existing),
        },
        { status: 409 }
      );
    }

    const saved = await createCustomerInvoiceFromSalesOrders(orders, session.email, "erp");
    return NextResponse.json(customerInvoiceForSession(session, saved), { status: 201 });
  } catch (error) {
    console.error("Failed to create customer invoice:", error);
    const message = error instanceof Error ? error.message : "Failed to create invoice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
