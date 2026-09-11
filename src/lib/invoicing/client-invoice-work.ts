/** Client-safe grouping for "one invoice per client" - do not import server data modules here. */
import { getInvoiceAmountPaid } from "@/lib/invoicing/payments";
import type { CustomerInvoice } from "@/lib/types/customer-invoices";
import type { InvoiceableSalesOrder } from "@/lib/types/invoiceable-orders";

export type ClientInvoiceWork = {
  key: string;
  client_name: string;
  drafts: CustomerInvoice[];
  orders: InvoiceableSalesOrder[];
};

/** Sales orders carry no client_id, so the client code is the shared key. */
function clientKey(row: { client_id?: string; client_code: string }): string {
  return (row.client_code.trim() || row.client_id?.trim() || "").toLowerCase();
}

/**
 * Everything that can still land on one invoice for a client: open drafts plus
 * sales orders with no invoice yet. Paid and sent invoices stay out.
 */
export function groupClientInvoiceWork(
  invoices: CustomerInvoice[],
  invoiceableOrders: InvoiceableSalesOrder[]
): ClientInvoiceWork[] {
  const groups = new Map<string, ClientInvoiceWork>();

  for (const invoice of invoices) {
    if (invoice.status !== "draft") continue;
    if (getInvoiceAmountPaid(invoice) > 0) continue;
    const key = clientKey(invoice);
    if (!key) continue;
    const group =
      groups.get(key) ?? { key, client_name: invoice.client_name, drafts: [], orders: [] };
    group.drafts.push(invoice);
    groups.set(key, group);
  }

  for (const order of invoiceableOrders) {
    const key = clientKey(order);
    if (!key) continue;
    const group =
      groups.get(key) ?? { key, client_name: order.client_name, drafts: [], orders: [] };
    group.orders.push(order);
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => group.drafts.length + group.orders.length >= 2)
    .filter((group) => group.drafts.length >= 1)
    .sort((a, b) => b.drafts.length + b.orders.length - (a.drafts.length + a.orders.length));
}

export function describeClientInvoiceWork(group: ClientInvoiceWork): string {
  const parts: string[] = [];
  if (group.drafts.length > 0) {
    parts.push(`${group.drafts.length} draft invoice${group.drafts.length !== 1 ? "s" : ""}`);
  }
  if (group.orders.length > 0) {
    parts.push(`${group.orders.length} uninvoiced order${group.orders.length !== 1 ? "s" : ""}`);
  }
  return parts.join(" and ");
}

export function clientInvoiceWorkButtonLabel(group: ClientInvoiceWork): string {
  if (group.orders.length === 0) {
    return `Combine ${group.drafts.length} invoices into 1`;
  }
  const orders = `${group.orders.length} order${group.orders.length !== 1 ? "s" : ""}`;
  if (group.drafts.length === 1) {
    return `Add ${orders} to this invoice`;
  }
  return `Combine ${group.drafts.length} invoices + ${orders} into 1`;
}
