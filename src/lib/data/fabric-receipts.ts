import path from "path";
import { readJsonFile, writeJsonFile } from "@/lib/data/json-file-cache";
import type { FabricReceipt, FabricReceiptsFile } from "@/lib/types/fabric-receipts";

const STORE_PATH = path.join(process.cwd(), "src/data/fabric-receipts.json");
const EMPTY_FABRIC_RECEIPTS: FabricReceiptsFile = { updated_at: null, receipts: [] };

export function readFabricReceipts(): FabricReceiptsFile {
  return readJsonFile(STORE_PATH, EMPTY_FABRIC_RECEIPTS);
}

export function writeFabricReceipts(data: FabricReceiptsFile): FabricReceiptsFile {
  const payload: FabricReceiptsFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return writeJsonFile(STORE_PATH, payload);
}

export function getFabricReceiptByLineId(lineId: string): FabricReceipt | undefined {
  return readFabricReceipts().receipts.find((receipt) => receipt.sales_order_line_id === lineId);
}

export function getFabricReceiptById(id: string): FabricReceipt | undefined {
  return readFabricReceipts().receipts.find((receipt) => receipt.id === id);
}
