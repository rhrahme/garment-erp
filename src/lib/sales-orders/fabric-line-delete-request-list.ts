import { isFabricOrderLineSent } from "@/lib/fabric-sourcing/fabric-order-line-status";
import {
  findFabricPoLineForSoFabricLine,
  getFabricPosForSalesOrder,
} from "@/lib/sales-orders/line-cross-reference";
import {
  formatFabricLineArticle,
  soArticleFromFabricLine,
} from "@/lib/sales-orders/label-codes";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

export type FabricLineDeleteRequestSummary = {
  sales_order_id: string;
  so_number: string;
  client_id: string;
  client_name: string;
  client_code: string;
  line_id: string;
  fabric_number: string;
  garment_type: string;
  supplier_name: string;
  quantity: number;
  unit: string;
  article_label: string;
  delete_requested_at: string;
  delete_requested_by: string;
  delete_request_reason: string | null;
  po_id: string | null;
  po_number: string | null;
  po_line_emailed: boolean;
};

export function isFabricLineDeletePending(
  line: Pick<SalesOrderFabricLine, "delete_requested_at">
): boolean {
  return Boolean(line.delete_requested_at);
}

export function listPendingFabricLineDeleteRequests(
  orders: SalesOrder[],
  allFabricPos: PurchaseOrder[]
): FabricLineDeleteRequestSummary[] {
  const pending: FabricLineDeleteRequestSummary[] = [];

  for (const order of orders) {
    const fabricPos = getFabricPosForSalesOrder(order, allFabricPos);
    for (const line of order.fabric_lines) {
      if (!line.delete_requested_at) continue;
      const match = findFabricPoLineForSoFabricLine(line, fabricPos);
      const article = soArticleFromFabricLine(line);
      pending.push({
        sales_order_id: order.id,
        so_number: order.so_number,
        client_id: order.client_id,
        client_name: order.client_name,
        client_code: order.client_code,
        line_id: line.id,
        fabric_number: line.fabric_number,
        garment_type: line.garment_type,
        supplier_name: line.supplier_name,
        quantity: line.quantity,
        unit: line.unit,
        article_label: formatFabricLineArticle(article),
        delete_requested_at: line.delete_requested_at,
        delete_requested_by: line.delete_requested_by ?? "unknown",
        delete_request_reason: line.delete_request_reason ?? null,
        po_id: match?.po.id ?? null,
        po_number: match?.po.po_number ?? null,
        po_line_emailed: match
          ? isFabricOrderLineSent(match.poLine, match.po)
          : false,
      });
    }
  }

  pending.sort((a, b) => b.delete_requested_at.localeCompare(a.delete_requested_at));
  return pending;
}

export function buildFabricLineDeleteRequestSummary(
  order: SalesOrder,
  line: SalesOrderFabricLine,
  fabricPos: PurchaseOrder[]
): FabricLineDeleteRequestSummary {
  const match = findFabricPoLineForSoFabricLine(line, fabricPos);
  return {
    sales_order_id: order.id,
    so_number: order.so_number,
    client_id: order.client_id,
    client_name: order.client_name,
    client_code: order.client_code,
    line_id: line.id,
    fabric_number: line.fabric_number,
    garment_type: line.garment_type,
    supplier_name: line.supplier_name,
    quantity: line.quantity,
    unit: line.unit,
    article_label: formatFabricLineArticle(soArticleFromFabricLine(line)),
    delete_requested_at: line.delete_requested_at ?? new Date().toISOString(),
    delete_requested_by: line.delete_requested_by ?? "unknown",
    delete_request_reason: line.delete_request_reason ?? null,
    po_id: match?.po.id ?? null,
    po_number: match?.po.po_number ?? null,
    po_line_emailed: match ? isFabricOrderLineSent(match.poLine, match.po) : false,
  };
}
