import { getFabricReceiptByLineId } from "@/lib/data/fabric-receipts";
import { resolveScanToLine } from "@/lib/production/stage-scan";
import {
  productionCodeFromSticker,
  resolveSoArticleForFabricLine,
  supplierFabricProductionCode,
} from "@/lib/sales-orders/label-codes";
import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import type { FabricLineReceiveStatus } from "@/lib/types/fabric-receipts";

export type FabricLabelLookupResult = {
  client_code: string;
  client_name: string;
  so_number: string;
  sales_order_id: string;
  sales_order_line_id: string;
  article_number: number;
  fabric_cut_code: string;
  production_code: string;
  garment_type: string;
  piece_name: string;
  fabric_number: string;
  supplier_name: string;
  composition: string | null;
  weight_gsm: number | null;
  receive_status: FabricLineReceiveStatus;
};

export function lookupFabricLabel(scanInput: string): FabricLabelLookupResult | null {
  const lookup = resolveScanToLine(scanInput);
  if (!lookup) return null;

  const { order, line, sticker } = lookup;
  const lineIndex = order.fabric_lines.findIndex((fabricLine) => fabricLine.id === line.id);
  const receipt = getFabricReceiptByLineId(line.id);

  let receive_status: FabricLineReceiveStatus = "pending";
  if (receipt?.status === "handed_off") receive_status = "handed_off";
  else if (receipt?.status === "fabric_prep") receive_status = "fabric_prep";
  else if (receipt) receive_status = "received";

  return {
    client_code: order.client_code,
    client_name: order.client_name,
    so_number: order.so_number,
    sales_order_id: order.id,
    sales_order_line_id: line.id,
    article_number: resolveSoArticleForFabricLine(line, lineIndex >= 0 ? lineIndex : 0),
    fabric_cut_code: supplierFabricProductionCode(sticker.code, order.client_code),
    production_code: productionCodeFromSticker(sticker.code, order.client_code),
    garment_type: line.garment_type,
    piece_name: sticker.piece_name,
    fabric_number: line.fabric_number,
    supplier_name: formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number),
    composition: line.composition ?? null,
    weight_gsm: line.weight_gsm ?? null,
    receive_status,
  };
}
