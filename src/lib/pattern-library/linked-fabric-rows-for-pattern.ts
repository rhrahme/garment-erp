import {
  buildClientFabricBoard,
  type ClientFabricBoardRow,
} from "@/lib/pattern-library/client-fabric-board";
import type { ClientPattern } from "@/lib/types/pattern-library";
import type { FabricReceipt } from "@/lib/types/fabric-receipts";
import type { SalesOrder } from "@/lib/types/sales-orders";

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
}): ClientFabricBoardRow[] {
  const lineIds = new Set(input.pattern.linked_fabric_line_ids ?? []);
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
