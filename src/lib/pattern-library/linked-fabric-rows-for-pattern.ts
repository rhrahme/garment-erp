import {
  buildClientFabricBoard,
  type ClientFabricBoardRow,
} from "@/lib/pattern-library/client-fabric-board";
import type { ClientPattern } from "@/lib/types/pattern-library";
import type { FabricReceipt } from "@/lib/types/fabric-receipts";
import type { SalesOrder } from "@/lib/types/sales-orders";

export type PatternLinkedJobLine = {
  client_pattern_id?: string | null;
  sales_order_line_id?: string | null;
};

/**
 * SO fabric lines that belong on this sheet for print / grouped fabrics:
 * explicit consolidate ids plus any pattern job already opened onto the sheet.
 * Jobs can be linked without a matching linked_fabric_line_ids entry (transfers).
 */
export function lineIdsForPatternPrint(
  pattern: Pick<ClientPattern, "id" | "linked_fabric_line_ids">,
  jobs: PatternLinkedJobLine[] = []
): string[] {
  const lineIds = new Set(
    (pattern.linked_fabric_line_ids ?? []).map((id) => id.trim()).filter(Boolean)
  );
  for (const job of jobs) {
    if (job.client_pattern_id && job.client_pattern_id !== pattern.id) continue;
    const lineId = job.sales_order_line_id?.trim();
    if (lineId) lineIds.add(lineId);
  }
  return [...lineIds];
}

/**
 * Linked SO fabric rows for one pattern - uses live receipts only (no archive
 * wait) so the measurement sheet can paint without the full client board.
 */
export function linkedFabricRowsForPattern(input: {
  pattern: ClientPattern;
  clientCode: string | null;
  clientName: string | null;
  orders: SalesOrder[];
  receipts: FabricReceipt[];
  jobs?: PatternLinkedJobLine[];
}): ClientFabricBoardRow[] {
  const lineIds = new Set(lineIdsForPatternPrint(input.pattern, input.jobs));
  if (lineIds.size === 0) return [];

  const board = buildClientFabricBoard({
    clientId: input.pattern.client_id,
    clientCode: input.clientCode,
    clientName: input.clientName,
    orders: input.orders,
    receipts: input.receipts,
    patterns: [input.pattern],
  });

  return board.rows.filter((row) => lineIds.has(row.line_id));
}
