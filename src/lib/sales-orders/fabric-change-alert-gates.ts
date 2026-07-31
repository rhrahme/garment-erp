import { listPatternJobsForOrder } from "@/lib/data/pattern-jobs";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

function lineHasActivePatternWork(salesOrderId: string, lineId: string): boolean {
  return listPatternJobsForOrder(salesOrderId).some(
    (job) =>
      job.sales_order_line_id === lineId &&
      job.status !== "cancelled" &&
      job.status !== "completed"
  );
}

export type FabricChangeSnapshot = {
  fabric_number: string;
  supplier_id: string;
  supplier_name: string;
  quantity: number;
  garment_type: string;
};

export function snapshotFabricLine(line: SalesOrderFabricLine): FabricChangeSnapshot {
  return {
    fabric_number: line.fabric_number,
    supplier_id: line.supplier_id,
    supplier_name: line.supplier_name,
    quantity: line.quantity,
    garment_type: line.garment_type,
  };
}

export function lineHasPrintEvidence(line: SalesOrderFabricLine): boolean {
  return Boolean(
    line.a4_printed_at || line.prep_stickers_printed_at || line.prod_stickers_printed_at
  );
}

export function orderHasFabricPosLock(order: SalesOrder): boolean {
  return order.status === "fabric_pos_created" || order.fabric_po_ids.length > 0;
}

/**
 * Fire when stickers/A4 may already exist, POs were created, or pattern work is live.
 * Label sticker codes alone do not qualify (they are generated at line create).
 */
export function shouldRecordFabricChangeAlert(
  order: SalesOrder,
  line: SalesOrderFabricLine | null,
  options: { force?: boolean } = {}
): boolean {
  if (options.force) return true;
  if (orderHasFabricPosLock(order)) return true;
  if (line && lineHasPrintEvidence(line)) return true;
  if (line && lineHasActivePatternWork(order.id, line.id)) return true;
  // Sibling lines already printed / in pattern - replacement or edit needs reprint of shared A4.
  if (order.fabric_lines.some((entry) => lineHasPrintEvidence(entry))) return true;
  if (order.fabric_lines.some((entry) => lineHasActivePatternWork(order.id, entry.id))) {
    return true;
  }
  return false;
}

export function fabricLineMeaningfullyChanged(
  before: FabricChangeSnapshot,
  after: FabricChangeSnapshot
): boolean {
  return (
    before.fabric_number.toLowerCase() !== after.fabric_number.toLowerCase() ||
    before.supplier_id !== after.supplier_id ||
    before.quantity !== after.quantity ||
    before.garment_type !== after.garment_type
  );
}

export function changedFieldsSummary(
  before: FabricChangeSnapshot | null,
  after: FabricChangeSnapshot | null
): string {
  if (!before && after) {
    return `Added ${after.fabric_number} (${after.quantity}m, ${after.garment_type})`;
  }
  if (before && !after) {
    return `Removed ${before.fabric_number} (${before.quantity}m, ${before.garment_type})`;
  }
  if (!before || !after) return "Fabric line changed";

  const parts: string[] = [];
  if (before.fabric_number.toLowerCase() !== after.fabric_number.toLowerCase()) {
    parts.push(`fabric ${before.fabric_number} -> ${after.fabric_number}`);
  }
  if (before.supplier_id !== after.supplier_id || before.supplier_name !== after.supplier_name) {
    parts.push(`supplier ${before.supplier_name} -> ${after.supplier_name}`);
  }
  if (before.quantity !== after.quantity) {
    parts.push(`meters ${before.quantity} -> ${after.quantity}`);
  }
  if (before.garment_type !== after.garment_type) {
    parts.push(`garment ${before.garment_type} -> ${after.garment_type}`);
  }
  return parts.length > 0 ? parts.join("; ") : "Fabric line updated";
}
