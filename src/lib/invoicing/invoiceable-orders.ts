import { getSalesOrderCost } from "@/lib/costing/compute";
import { getCustomerInvoiceBySalesOrderId } from "@/lib/data/customer-invoices";
import { isReadyMadeSalesOrder, listBespokeSalesOrders, readSalesOrders } from "@/lib/data/sales-orders";
import { isSalesOrderArchived } from "@/lib/sales-orders/archive";
import type { InvoiceableSalesOrder } from "@/lib/types/invoiceable-orders";

export function getInvoiceableSalesOrders(limit = 25): InvoiceableSalesOrder[] {
  const invoicedOrderIds = new Set(
    readSalesOrders()
      .orders.map((order) => getCustomerInvoiceBySalesOrderId(order.id))
      .filter(Boolean)
      .map((invoice) => invoice!.sales_order_id)
  );

  const orders = listBespokeSalesOrders(readSalesOrders().orders)
    .filter((order) => !isReadyMadeSalesOrder(order))
    .filter((order) => !invoicedOrderIds.has(order.id))
    .filter((order) => !isSalesOrderArchived(order))
    .filter((order) => order.fabric_lines.length > 0)
    .sort((a, b) => b.order_date.localeCompare(a.order_date))
    .slice(0, limit);

  return orders.map((order) => {
    const cost = getSalesOrderCost(order);
    const pieceCount = order.fabric_lines.reduce(
      (sum, line) => sum + Math.max(line.label_stickers?.length ?? line.label_count, 0),
      0
    );

    return {
      id: order.id,
      so_number: order.so_number,
      client_name: order.client_name,
      client_code: order.client_code,
      order_date: order.order_date,
      status: order.status,
      piece_count: pieceCount,
      fabric_line_count: order.fabric_lines.length,
      estimated_cost_sar: cost.total_cost_sar,
    };
  });
}

export function countInvoiceableSalesOrders(): number {
  const invoicedIds = new Set(
    readSalesOrders()
      .orders.map((order) => getCustomerInvoiceBySalesOrderId(order.id))
      .filter(Boolean)
      .map((invoice) => invoice!.sales_order_id)
  );

  return listBespokeSalesOrders(readSalesOrders().orders).filter(
    (order) =>
      !isReadyMadeSalesOrder(order) &&
      !invoicedIds.has(order.id) &&
      !isSalesOrderArchived(order) &&
      order.fabric_lines.length > 0
  ).length;
}
