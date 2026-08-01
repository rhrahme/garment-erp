import { isSalesOrderArchived } from "@/lib/sales-orders/archive";
import { orderLineHasStockAlert } from "@/lib/fabric-sourcing/fabric-stock";
import {
  formatFabricLineArticle,
  resolveSoArticleForFabricLine,
} from "@/lib/sales-orders/label-codes";
import { totalProductionLabels } from "@/lib/sales-orders/label-display";
import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import type { SalesOrderListRow } from "@/lib/data/sales-orders";
import type { SalesOrder } from "@/lib/types/sales-orders";

/** Client-safe list row mapper (no fabric-PO email enrichment). */
export function toSalesOrderListRowClient(order: SalesOrder): SalesOrderListRow {
  const parts: Array<string | null | undefined> = [
    order.so_number,
    order.client_code,
    order.client_name,
    order.client_reference,
    order.product_article,
    order.retail_brand,
    order.delivery_destination,
    order.status,
    order.notes,
  ];

  for (const line of order.fabric_lines) {
    parts.push(
      line.fabric_number,
      line.supplier_name,
      formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number),
      line.supplier_id,
      line.garment_type,
      line.composition,
      line.color,
      line.stock_status ?? null,
      line.replacement_fabric_number,
      ...(line.label_stickers ?? []).map((sticker) => sticker.code)
    );
  }

  return {
    id: order.id,
    so_number: order.so_number,
    client_code: order.client_code,
    client_name: order.client_name,
    product_article: order.product_article ?? null,
    fabric_article_labels: order.fabric_lines.map((line, index) =>
      formatFabricLineArticle(resolveSoArticleForFabricLine(line, index))
    ),
    fabric_line_count: order.fabric_lines.length,
    fabric_preview_lines: order.fabric_lines.map((line) => ({
      supplier_id: line.supplier_id,
      fabric_number: line.fabric_number,
    })),
    fabric_stock_alert_count: order.fabric_lines.filter((line) => orderLineHasStockAlert(line)).length,
    production_label_count: totalProductionLabels(order.fabric_lines),
    fabric_order_requested_at: order.fabric_order_requested_at ?? null,
    order_date: order.order_date,
    delivery_date: order.delivery_date,
    status: order.status,
    is_archived: isSalesOrderArchived(order),
    supplier_email_status: "none",
    supplier_email_sent: 0,
    supplier_email_pending: 0,
    search_text: parts
      .filter((value): value is string => Boolean(value && String(value).trim()))
      .join(" ")
      .toLowerCase(),
  };
}

export function listBespokeSalesOrdersClient(orders: SalesOrder[]): SalesOrder[] {
  return orders.filter((order) => !order.retail_brand?.trim());
}
