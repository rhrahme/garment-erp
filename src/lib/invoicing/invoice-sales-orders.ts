import type { CustomerInvoice } from "@/lib/types/customer-invoices";
import type { SalesOrder } from "@/lib/types/sales-orders";

export function invoiceSalesOrderIds(
  invoice: Pick<CustomerInvoice, "sales_order_id" | "sales_order_ids">
): string[] {
  const extras = (invoice.sales_order_ids ?? []).map((id) => id.trim()).filter(Boolean);
  const primary = invoice.sales_order_id?.trim();
  const ids = extras.length > 0 ? extras : primary ? [primary] : [];
  return [...new Set(ids)];
}

export function invoiceCoversSalesOrder(
  invoice: Pick<CustomerInvoice, "sales_order_id" | "sales_order_ids">,
  salesOrderId: string
): boolean {
  const id = salesOrderId.trim();
  if (!id) return false;
  return invoiceSalesOrderIds(invoice).includes(id);
}

export function formatInvoiceSoNumberList(soNumbers: string[]): string {
  return [...new Set(soNumbers.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  ).join(", ");
}

export function invoiceSalesOrderCount(
  invoice: Pick<CustomerInvoice, "sales_order_id" | "sales_order_ids" | "so_number">
): number {
  const ids = invoiceSalesOrderIds(invoice);
  if (ids.length > 1) return ids.length;
  const listed = invoice.so_number.split(",").map((value) => value.trim()).filter(Boolean);
  return Math.max(ids.length, listed.length, invoice.so_number.trim() ? 1 : 0);
}

export function invoiceSalesOrderRefs(invoice: CustomerInvoice): Array<{ id: string; so_number: string }> {
  const ids = invoiceSalesOrderIds(invoice);
  const numbers = invoice.so_number.split(",").map((value) => value.trim()).filter(Boolean);
  if (ids.length === numbers.length) {
    return ids.map((id, index) => ({ id, so_number: numbers[index]! }));
  }
  if (ids.length === 1) {
    return [{ id: ids[0]!, so_number: invoice.so_number }];
  }
  return ids.map((id, index) => ({ id, so_number: numbers[index] ?? id }));
}

export function asSalesOrderList(
  order: SalesOrder | SalesOrder[] | null | undefined
): SalesOrder[] {
  if (!order) return [];
  return Array.isArray(order) ? order : [order];
}

export function withInvoiceSalesOrders<T extends CustomerInvoice>(
  invoice: T,
  orders: Array<{ id: string; so_number: string }>
): T {
  const unique = [
    ...new Map(orders.map((order) => [order.id.trim(), order])).values(),
  ].sort((a, b) => a.so_number.localeCompare(b.so_number));
  return {
    ...invoice,
    sales_order_id: unique[0]?.id ?? invoice.sales_order_id,
    sales_order_ids: unique.length > 1 ? unique.map((order) => order.id) : undefined,
    so_number: formatInvoiceSoNumberList(unique.map((order) => order.so_number)) || invoice.so_number,
  };
}

export function findSalesOrderForInvoiceLine(
  orders: SalesOrder[],
  line: { sales_order_line_id?: string | null; sticker_code?: string | null }
): SalesOrder | undefined {
  const fabricLineId = line.sales_order_line_id?.trim();
  if (fabricLineId) {
    const byLine = orders.find((order) => order.fabric_lines.some((row) => row.id === fabricLineId));
    if (byLine) return byLine;
  }
  const sticker = line.sticker_code?.trim();
  if (sticker) {
    const bySticker = orders.find((order) =>
      order.fabric_lines.some((row) => row.label_stickers?.some((item) => item.code === sticker))
    );
    if (bySticker) return bySticker;
  }
  return orders[0];
}
