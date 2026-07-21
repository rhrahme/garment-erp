import path from "path";
import {
  readJsonFile,
  readJsonFileFresh,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import type { FabricTransfer, FabricTransfersFile } from "@/lib/types/fabric-transfers";

const STORE_PATH = path.join(process.cwd(), "src/data/fabric-transfers.json");
const EMPTY: FabricTransfersFile = { updated_at: null, transfers: [] };

export function readFabricTransfers(): FabricTransfersFile {
  return readJsonFile(STORE_PATH, EMPTY);
}

export function readFabricTransfersFresh(): FabricTransfersFile {
  return readJsonFileFresh(STORE_PATH, EMPTY);
}

export async function readFabricTransfersFreshAsync(): Promise<FabricTransfersFile> {
  return readJsonFileFreshAsync(STORE_PATH, EMPTY, { force: true });
}

export async function writeFabricTransfers(data: FabricTransfersFile): Promise<FabricTransfersFile> {
  const payload: FabricTransfersFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return saveDocument(STORE_PATH, payload);
}

export async function appendFabricTransfer(transfer: FabricTransfer): Promise<FabricTransfer> {
  const store = structuredClone(await readFabricTransfersFreshAsync());
  store.transfers.unshift(transfer);
  await writeFabricTransfers(store);
  return transfer;
}

export function listFabricTransfersForSalesOrder(salesOrderId: string): FabricTransfer[] {
  return readFabricTransfersFresh().transfers.filter(
    (transfer) =>
      transfer.source.sales_order_id === salesOrderId ||
      transfer.destination.sales_order_id === salesOrderId ||
      transfer.replacement.sales_order_id === salesOrderId
  );
}

export function listFabricTransfersForLine(lineId: string): FabricTransfer[] {
  return readFabricTransfersFresh().transfers.filter(
    (transfer) =>
      transfer.source.line_id === lineId ||
      transfer.destination.line_id === lineId ||
      transfer.replacement.line_id === lineId
  );
}
