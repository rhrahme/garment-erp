import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getClientById } from "@/lib/data/clients";
import { readFabricReceipts, readFabricReceiptsArchive } from "@/lib/data/fabric-receipts";
import { readPatternLibraryFresh } from "@/lib/data/pattern-library";
import { readSalesOrders } from "@/lib/data/sales-orders";
import {
  buildClientFabricBoard,
  type ClientFabricBoard,
} from "@/lib/pattern-library/client-fabric-board";

/** Assemble the pattern team's client fabric board from live documents. */
export async function loadClientFabricBoard(clientId: string): Promise<ClientFabricBoard> {
  await ensureDocumentsLoaded([
    "pattern_library",
    "clients",
    "sales_orders",
    "fabric_receipts",
    "fabric_receipts_archive",
  ]);
  const [library, orders] = [await readPatternLibraryFresh(), readSalesOrders().orders];
  const receipts = [...readFabricReceipts().receipts, ...readFabricReceiptsArchive().receipts];
  const client = getClientById(clientId);
  const clientName = client
    ? [client.first_name, client.middle_name, client.last_name].filter(Boolean).join(" ")
    : null;

  return buildClientFabricBoard({
    clientId,
    clientCode: client?.code ?? null,
    clientName,
    orders,
    receipts,
    patterns: library.client_patterns,
  });
}
