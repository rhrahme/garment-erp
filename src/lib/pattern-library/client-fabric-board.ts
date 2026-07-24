import type { ClientPattern } from "@/lib/types/pattern-library";
import type { FabricReceipt } from "@/lib/types/fabric-receipts";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";
import {
  resolveSoArticleForFabricLine,
  stripBrandPrefixFromProductionCode,
  supplierFabricProductionCode,
} from "@/lib/sales-orders/label-codes";

/**
 * Client fabric board — the pattern team's per-client view of every fabric
 * article across sales orders, with receiving/prep status and the garment
 * (client pattern) each fabric has been grouped into. Deliberately price-free.
 */

export type ClientFabricStatus =
  | "on_order"
  | "received"
  | "washing"
  | "drying"
  | "ironing"
  | "ready";

export const CLIENT_FABRIC_STATUS_LABELS: Record<ClientFabricStatus, string> = {
  on_order: "On order",
  received: "Received",
  washing: "Washing",
  drying: "Drying",
  ironing: "Ironing",
  ready: "Ready (prep done)",
};

export function resolveClientFabricStatus(
  receipt: Pick<FabricReceipt, "status" | "fabric_prep_step"> | null | undefined
): ClientFabricStatus {
  if (!receipt) return "on_order";
  if (receipt.status === "handed_off") return "ready";
  if (receipt.status === "fabric_prep") {
    if (receipt.fabric_prep_step === "drying") return "drying";
    if (receipt.fabric_prep_step === "iron") return "ironing";
    return "washing";
  }
  return "received";
}

export interface ClientFabricAssignedPattern {
  pattern_id: string;
  pattern_ref: string;
  garment_type: string;
}

export interface ClientFabricBoardRow {
  sales_order_id: string;
  so_number: string;
  order_date: string;
  line_id: string;
  /** e.g. 0122-L06 — production code with the brand prefix dropped. */
  article_code: string;
  /** e.g. L06 */
  article_label: string;
  garment_type: string;
  fabric_number: string;
  supplier_id: string;
  supplier_name: string;
  composition: string | null;
  weight_gsm: number | null;
  width_cm: number | null;
  width_inches: number | null;
  color: string | null;
  meters: number;
  unit: string;
  status: ClientFabricStatus;
  status_label: string;
  /** Prep lifecycle timestamps — for the status history in the detail panel. */
  received_at: string | null;
  wash_started_at: string | null;
  dry_started_at: string | null;
  iron_started_at: string | null;
  iron_done_at: string | null;
  handed_off_at: string | null;
  prep_type: string | null;
  prep_step: string | null;
  assigned_pattern: ClientFabricAssignedPattern | null;
}

export interface ClientFabricBoardPattern {
  id: string;
  pattern_ref: string;
  garment_type: string;
  is_final: boolean;
  linked_line_count: number;
}

export interface ClientFabricBoard {
  client: { id: string; code: string; name: string };
  rows: ClientFabricBoardRow[];
  patterns: ClientFabricBoardPattern[];
  summary: { total: number; assigned: number };
}

function articleCode(order: SalesOrder, line: SalesOrderFabricLine, lineIndex: number): string {
  const article = resolveSoArticleForFabricLine(line, lineIndex);
  const articleLabel = `L${String(article).padStart(2, "0")}`;
  const firstSticker = line.label_stickers[0]?.code;
  if (firstSticker) {
    const production = supplierFabricProductionCode(firstSticker, order.client_code);
    return stripBrandPrefixFromProductionCode(production, order.client_code);
  }
  const soDigits = order.so_number.match(/SO-\d{4}-(\d{4,})$/)?.[1] ?? order.so_number;
  return `${soDigits}-${articleLabel}`;
}

export function buildClientFabricBoard(input: {
  clientId: string;
  clientCode?: string | null;
  clientName?: string | null;
  orders: SalesOrder[];
  receipts: FabricReceipt[];
  patterns: ClientPattern[];
}): ClientFabricBoard {
  const orders = input.orders
    .filter((order) => order.client_id === input.clientId)
    .sort((a, b) => b.so_number.localeCompare(a.so_number));
  const clientPatterns = input.patterns.filter((pattern) => pattern.client_id === input.clientId);

  const receiptByLineId = new Map<string, FabricReceipt>();
  for (const receipt of input.receipts) {
    if (!receiptByLineId.has(receipt.sales_order_line_id)) {
      receiptByLineId.set(receipt.sales_order_line_id, receipt);
    }
  }

  const assignmentByLineId = new Map<string, ClientFabricAssignedPattern>();
  for (const pattern of clientPatterns) {
    for (const lineId of pattern.linked_fabric_line_ids ?? []) {
      assignmentByLineId.set(lineId, {
        pattern_id: pattern.id,
        pattern_ref: pattern.pattern_ref,
        garment_type: pattern.garment_type,
      });
    }
  }

  const rows: ClientFabricBoardRow[] = [];
  for (const order of orders) {
    order.fabric_lines.forEach((line, index) => {
      const receipt = receiptByLineId.get(line.id) ?? null;
      const status = resolveClientFabricStatus(receipt);
      rows.push({
        sales_order_id: order.id,
        so_number: order.so_number,
        order_date: order.order_date,
        line_id: line.id,
        article_code: articleCode(order, line, index),
        article_label: `L${String(resolveSoArticleForFabricLine(line, index)).padStart(2, "0")}`,
        garment_type: line.garment_type,
        fabric_number: line.fabric_number,
        supplier_id: line.supplier_id,
        supplier_name: line.supplier_name,
        composition: line.composition ?? null,
        weight_gsm: line.weight_gsm ?? null,
        width_cm: line.width_cm ?? null,
        width_inches: line.width_inches ?? null,
        color: line.color ?? null,
        meters: line.quantity,
        unit: line.unit,
        status,
        status_label: CLIENT_FABRIC_STATUS_LABELS[status],
        received_at: receipt?.received_at ?? null,
        wash_started_at: receipt?.wash_started_at ?? null,
        dry_started_at: receipt?.dry_started_at ?? null,
        iron_started_at: receipt?.iron_started_at ?? null,
        iron_done_at: receipt?.iron_done_at ?? null,
        handed_off_at: receipt?.handed_off_at ?? null,
        prep_type: receipt?.fabric_prep_type ?? null,
        prep_step: receipt?.fabric_prep_step ?? null,
        assigned_pattern: assignmentByLineId.get(line.id) ?? null,
      });
    });
  }

  const patterns: ClientFabricBoardPattern[] = clientPatterns
    .map((pattern) => ({
      id: pattern.id,
      pattern_ref: pattern.pattern_ref,
      garment_type: pattern.garment_type,
      is_final: pattern.final_version_id !== null,
      linked_line_count: (pattern.linked_fabric_line_ids ?? []).length,
    }))
    .sort((a, b) => a.pattern_ref.localeCompare(b.pattern_ref));

  const firstOrder = orders[0] ?? null;
  const firstPattern = clientPatterns[0] ?? null;
  return {
    client: {
      id: input.clientId,
      code: input.clientCode ?? firstOrder?.client_code ?? firstPattern?.client_code ?? "",
      name: input.clientName ?? firstOrder?.client_name ?? firstPattern?.client_name ?? "",
    },
    rows,
    patterns,
    summary: {
      total: rows.length,
      assigned: rows.filter((row) => row.assigned_pattern !== null).length,
    },
  };
}

/**
 * Exclusive grouping: linking line ids to one pattern strips them from every
 * other pattern of the same client, so reassignment is a single action.
 * Returns the new linked list for the target plus the other patterns touched.
 */
export function applyFabricLineAssignment(
  patterns: ClientPattern[],
  targetPatternId: string,
  lineIds: string[]
): {
  targetLinkedLineIds: string[];
  strippedFromOthers: { patternId: string; linkedLineIds: string[] }[];
} {
  const target = patterns.find((pattern) => pattern.id === targetPatternId);
  if (!target) {
    return { targetLinkedLineIds: [], strippedFromOthers: [] };
  }
  const requested = [...new Set(lineIds.map((id) => id.trim()).filter(Boolean))];
  const targetLinkedLineIds = [
    ...new Set([...(target.linked_fabric_line_ids ?? []), ...requested]),
  ];

  const strippedFromOthers: { patternId: string; linkedLineIds: string[] }[] = [];
  const requestedSet = new Set(requested);
  for (const pattern of patterns) {
    if (pattern.id === targetPatternId || pattern.client_id !== target.client_id) continue;
    const existing = pattern.linked_fabric_line_ids ?? [];
    const remaining = existing.filter((id) => !requestedSet.has(id));
    if (remaining.length !== existing.length) {
      strippedFromOthers.push({ patternId: pattern.id, linkedLineIds: remaining });
    }
  }

  return { targetLinkedLineIds, strippedFromOthers };
}
