import { saveCustomerInvoice } from "@/lib/data/customer-invoices";
import { readSalesOrdersFresh, writeSalesOrders } from "@/lib/data/sales-orders";
import { syncInvoiceLinesFromSalesOrder } from "@/lib/invoicing/build-invoice";
import { notifyIntegration } from "@/lib/integrations";
import type { CustomerInvoice, CustomerInvoiceStatus } from "@/lib/types/customer-invoices";
import type { SalesOrder } from "@/lib/types/sales-orders";

export async function applyCustomerInvoiceStatusChange(
  invoice: CustomerInvoice,
  status: CustomerInvoiceStatus,
  options?: {
    sent_at?: string | null;
    paid_at?: string | null;
    source?: "erp" | "zapier" | "api";
  }
): Promise<CustomerInvoice> {
  const allowed: CustomerInvoiceStatus[] = ["draft", "sent", "paid"];
  if (!allowed.includes(status)) {
    throw new Error("Invalid invoice status.");
  }

  if (status === invoice.status && options?.sent_at === undefined && options?.paid_at === undefined) {
    return invoice;
  }

  const source = options?.source ?? "erp";
  const next: CustomerInvoice = { ...invoice, status };

  if (options?.sent_at !== undefined) {
    next.sent_at = options.sent_at;
  } else if (status === "sent" && !next.sent_at) {
    next.sent_at = new Date().toISOString();
  }

  if (options?.paid_at !== undefined) {
    next.paid_at = options.paid_at;
  } else if (status === "paid" && !next.paid_at) {
    next.paid_at = new Date().toISOString();
    if (!next.sent_at) next.sent_at = next.paid_at;
  }

  if (status === "sent" || status === "paid") {
    const store = await readSalesOrdersFresh();
    const orderIndex = store.orders.findIndex((order) => order.id === invoice.sales_order_id);
    if (orderIndex >= 0) {
      store.orders[orderIndex] = { ...store.orders[orderIndex]!, status: "complete" };
      await writeSalesOrders(store);
    }
  }

  const saved = await saveCustomerInvoice(next);

  if (status === "sent" && invoice.status !== "sent") {
    await notifyIntegration(
      "invoice.sent",
      {
        id: saved.id,
        invoice_number: saved.invoice_number,
        sales_order_id: saved.sales_order_id,
        so_number: saved.so_number,
        client_id: saved.client_id,
        client_code: saved.client_code,
        client_name: saved.client_name,
        total: saved.total,
        currency: saved.currency,
        sent_at: saved.sent_at,
      },
      source
    );
  }

  return saved;
}

export async function applyCustomerInvoiceLineSync(
  invoice: CustomerInvoice,
  order: SalesOrder
): Promise<CustomerInvoice> {
  const synced = syncInvoiceLinesFromSalesOrder(invoice, order);
  return saveCustomerInvoice(synced);
}
