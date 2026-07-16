import {
  completeFabricPrepActionLabel,
  fabricPrepStatusLabel,
  fabricPrepStepLabel,
  fabricPrepTypeLabel,
} from "@/lib/production/fabric-prep";
import {
  fabricLineHighlightLabel,
  fabricLineToHighlightStage,
  type ScanHighlightStage,
} from "@/lib/production/scan-stage-highlight";
import type { FabricReceipt, PendingFabricLine } from "@/lib/types/fabric-receipts";

export type FabricReceivingWorkTab = "to_receive" | "awaiting_prep" | "in_prep" | "all";

export type FabricReceivingWorkRow = {
  key: string;
  kind: "pending" | "receipt";
  sales_order_id: string;
  sales_order_line_id: string;
  so_number: string;
  client_name: string;
  garment_type: string;
  supplier_name: string;
  fabric_number: string;
  fabric_meters: number;
  composition: string | null;
  weight_gsm: number | null;
  scan_stage: ScanHighlightStage;
  scan_stage_label: string;
  next_action: string;
  /** Plain-language prep stage for the row header. */
  stage_summary: string | null;
  receipt: FabricReceipt | null;
};

export function receiptStageSummary(receipt: FabricReceipt): string {
  if (receipt.status === "received") {
    return "Received — waiting to start prep";
  }
  if (receipt.status === "fabric_prep" && receipt.fabric_prep_type && receipt.fabric_prep_step) {
    return `${fabricPrepTypeLabel(receipt.fabric_prep_type)} · ${fabricPrepStepLabel(receipt.fabric_prep_step)} now`;
  }
  return "On the receiving floor";
}

export function nextActionForPending(): string {
  return "Scan at Receive";
}

export function nextActionForReceipt(receipt: FabricReceipt): string {
  if (receipt.status === "received") {
    return "Start wash, soak, or iron on the work list";
  }
  if (receipt.status === "fabric_prep" && receipt.fabric_prep_type && receipt.fabric_prep_step) {
    const step = receipt.fabric_prep_step;
    if (step === "wash") return "Finish wash → start ironing (button or Wash scan)";
    if (step === "soak") return "Finish soak → start ironing (button or Soak scan)";
    if (step === "iron") return "Finish ironing → cutting (button or Iron scan)";
    return fabricPrepStatusLabel(receipt.fabric_prep_type, step);
  }
  return "Complete prep";
}

function pendingToRow(line: PendingFabricLine): FabricReceivingWorkRow {
  const scan_stage = fabricLineToHighlightStage("pending", null);
  return {
    key: `pending-${line.sales_order_line_id}`,
    kind: "pending",
    sales_order_id: line.sales_order_id,
    sales_order_line_id: line.sales_order_line_id,
    so_number: line.so_number,
    client_name: line.client_name,
    garment_type: line.garment_type,
    supplier_name: line.supplier_name,
    fabric_number: line.fabric_number,
    fabric_meters: line.fabric_meters,
    composition: line.composition,
    weight_gsm: line.weight_gsm,
    scan_stage,
    scan_stage_label: fabricLineHighlightLabel("pending", null),
    next_action: nextActionForPending(),
    stage_summary: "Not received yet",
    receipt: null,
  };
}

function receiptToRow(receipt: FabricReceipt): FabricReceivingWorkRow {
  const scan_stage = fabricLineToHighlightStage(receipt.status, receipt.fabric_prep_step);
  return {
    key: `receipt-${receipt.id}`,
    kind: "receipt",
    sales_order_id: receipt.sales_order_id,
    sales_order_line_id: receipt.sales_order_line_id,
    so_number: receipt.so_number,
    client_name: receipt.client_name,
    garment_type: receipt.garment_type,
    supplier_name: receipt.supplier_name,
    fabric_number: receipt.fabric_number,
    fabric_meters: receipt.fabric_meters,
    composition: receipt.composition,
    weight_gsm: receipt.weight_gsm,
    scan_stage,
    scan_stage_label: fabricLineHighlightLabel(receipt.status, receipt.fabric_prep_step),
    next_action: nextActionForReceipt(receipt),
    stage_summary: receiptStageSummary(receipt),
    receipt,
  };
}

export function buildFabricReceivingWorkRows(
  pending: PendingFabricLine[],
  receipts: FabricReceipt[]
): FabricReceivingWorkRow[] {
  const pendingRows = pending.map(pendingToRow);
  const receiptRows = receipts.map(receiptToRow);

  return [...pendingRows, ...receiptRows].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "pending" ? -1 : 1;
    const so = a.so_number.localeCompare(b.so_number);
    if (so !== 0) return so;
    return a.fabric_number.localeCompare(b.fabric_number);
  });
}

export function filterWorkRowsByTab(
  rows: FabricReceivingWorkRow[],
  tab: FabricReceivingWorkTab
): FabricReceivingWorkRow[] {
  if (tab === "to_receive") return rows.filter((row) => row.kind === "pending");
  if (tab === "awaiting_prep") {
    return rows.filter((row) => row.receipt?.status === "received");
  }
  if (tab === "in_prep") {
    return rows.filter((row) => row.receipt?.status === "fabric_prep");
  }
  return rows;
}

export function prepAdvanceLabel(receipt: FabricReceipt): string | null {
  if (receipt.status !== "fabric_prep" || !receipt.fabric_prep_type || !receipt.fabric_prep_step) {
    return null;
  }
  return (
    completeFabricPrepActionLabel(receipt.fabric_prep_type, receipt.fabric_prep_step) ??
    "Advance prep step"
  );
}

export function tabCounts(rows: FabricReceivingWorkRow[]) {
  return {
    to_receive: rows.filter((r) => r.kind === "pending").length,
    awaiting_prep: rows.filter((r) => r.receipt?.status === "received").length,
    in_prep: rows.filter((r) => r.receipt?.status === "fabric_prep").length,
    all: rows.length,
  };
}

/** Same garment + fabric + supplier = one physical article. */
export function fabricArticleKey(row: Pick<FabricReceivingWorkRow, "garment_type" | "fabric_number" | "supplier_name">): string {
  return [row.garment_type, row.fabric_number, row.supplier_name]
    .map((part) => part.trim().toLowerCase())
    .join("|");
}

function rowSortPriority(row: FabricReceivingWorkRow): number {
  if (row.kind === "receipt") return 2;
  return 1;
}

/** Collapse duplicate articles (e.g. re-imported ClickUp lines) — keep the row furthest along. */
export function dedupeWorkRowsByArticle(rows: FabricReceivingWorkRow[]): FabricReceivingWorkRow[] {
  const bestByArticle = new Map<string, FabricReceivingWorkRow>();

  for (const row of rows) {
    const key = `${row.client_name.toLowerCase()}::${fabricArticleKey(row)}`;
    const existing = bestByArticle.get(key);
    if (!existing) {
      bestByArticle.set(key, row);
      continue;
    }
    const existingPriority = rowSortPriority(existing);
    const rowPriority = rowSortPriority(row);
    if (rowPriority > existingPriority || (rowPriority === existingPriority && row.so_number > existing.so_number)) {
      bestByArticle.set(key, row);
    }
  }

  return Array.from(bestByArticle.values());
}

export function groupWorkRowsByClient(
  rows: FabricReceivingWorkRow[]
): Array<{ client_name: string; rows: FabricReceivingWorkRow[] }> {
  const map = new Map<string, FabricReceivingWorkRow[]>();
  for (const row of rows) {
    const list = map.get(row.client_name) ?? [];
    list.push(row);
    map.set(row.client_name, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([client_name, clientRows]) => ({ client_name, rows: clientRows }));
}
