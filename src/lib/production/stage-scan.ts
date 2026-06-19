import { getFabricReceiptByLineId } from "@/lib/data/fabric-receipts";
import { getProductionWorkOrderBySticker, readProductionWorkOrders } from "@/lib/data/production-work-orders";
import { readSalesOrders } from "@/lib/data/sales-orders";
import {
  advanceFabricReceipt,
  receiveFabricLine,
  startFabricReceiptPrep,
} from "@/lib/production/fabric-receiving";
import {
  advanceProductionWorkOrder,
  findStickerInSalesOrders,
} from "@/lib/production/sticker-scan";
import {
  fabricLineArticleNumber,
  productionCodeFromSticker,
  supplierFabricProductionCode,
} from "@/lib/sales-orders/label-codes";
import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import {
  fabricReceivingStationError,
  isFabricReceivingStation,
} from "@/lib/production/fabric-receiving-scan";
import { getGarmentPieces } from "@/lib/sales-orders/label-codes";
import { fabricCutCodesMatch } from "@/lib/production/scan-input";
import type { FabricReceipt } from "@/lib/types/fabric-receipts";
import type { ProductionWorkOrder } from "@/lib/types/production";

export type ScanStation =
  | "receive"
  | "wash"
  | "soak"
  | "iron"
  | "cutting"
  | "sewing"
  | "garment_wash"
  | "finishing"
  | "packed";

export type StageScanNotice =
  | "created"
  | "already_received"
  | "advanced"
  | "checked_in";

export type StageScanResult = {
  station: ScanStation;
  message: string;
  client_code: string;
  production_code: string;
  /** One code per fabric cut — what floor staff search for on the work list. */
  fabric_cut_code: string;
  article_number: number;
  garment_type: string;
  so_number: string;
  piece_name: string;
  fabric_number: string;
  /** UI hint — e.g. re-scan at Receive when already received does not advance the line. */
  notice?: StageScanNotice;
  receipt?: FabricReceipt;
  work_order?: ProductionWorkOrder;
};

function normalizeScan(code: string): string {
  return code.trim().toUpperCase();
}

/** Resolve scan to a fabric line — piece code or line-level fabric cut code. */
export function resolveScanToLine(scanInput: string) {
  const direct = findStickerInSalesOrders(scanInput);
  if (direct) return direct;

  const normalized = normalizeScan(scanInput);
  if (!normalized) return null;

  for (const order of readSalesOrders().orders) {
    for (const line of order.fabric_lines) {
      for (const sticker of line.label_stickers ?? []) {
        const cutCode = supplierFabricProductionCode(sticker.code, order.client_code).toUpperCase();
        if (cutCode === normalized || fabricCutCodesMatch(normalized, cutCode)) {
          return { order, line, sticker };
        }
      }
    }
  }
  return null;
}

function productionCodeForResult(lookup: NonNullable<ReturnType<typeof resolveScanToLine>>): string {
  return productionCodeFromSticker(lookup.sticker.code, lookup.order.client_code);
}

export async function scanAtStation(scanInput: string, station: ScanStation): Promise<StageScanResult> {
  const lookup = resolveScanToLine(scanInput);
  if (!lookup) {
    throw new Error("Sticker code not recognized — check client + production code on the label.");
  }

  const { order, line, sticker } = lookup;
  const production_code = productionCodeForResult(lookup);
  const lineIndex = order.fabric_lines.findIndex((fabricLine) => fabricLine.id === line.id);
  const base = {
    station,
    client_code: order.client_code,
    production_code,
    fabric_cut_code: supplierFabricProductionCode(sticker.code, order.client_code),
    article_number: fabricLineArticleNumber(lineIndex >= 0 ? lineIndex : 0),
    garment_type: line.garment_type,
    so_number: order.so_number,
    piece_name: sticker.piece_name,
    fabric_number: line.fabric_number,
  };

  const supplierLabel = formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number);

  if (station === "receive") {
    const result = await receiveFabricLine(line.id);
    return {
      ...base,
      message: result.created
        ? `Received — ${supplierLabel} ${line.fabric_number} (${line.garment_type}).`
        : `Already received — ${supplierLabel} ${line.fabric_number}. Select Wash, Soak, or Iron, then scan again.`,
      notice: result.created ? "created" : "already_received",
      receipt: result.receipt,
    };
  }

  const receipt = getFabricReceiptByLineId(line.id);
  if (!receipt && station !== "cutting" && station !== "sewing") {
    throw new Error("Fabric not received yet — scan at Receive station first.");
  }

  if (station === "wash") {
    if (!receipt) throw new Error("Fabric receipt not found.");
    const stationError = fabricReceivingStationError(receipt, "wash");
    if (stationError) throw new Error(stationError);
    if (receipt.status === "received") {
      const updated = await startFabricReceiptPrep(receipt.id, "wash_iron");
      return {
        ...base,
        message: `Wash started — ${line.fabric_number}. Scan again at Wash when done, then Iron.`,
        receipt: updated,
        notice: "advanced",
      };
    }
    if (receipt.status === "fabric_prep" && receipt.fabric_prep_step === "wash") {
      const { receipt: updated } = await advanceFabricReceipt(receipt.id);
      return {
        ...base,
        message: `Wash complete — move to ironing (${line.fabric_number}).`,
        receipt: updated,
        notice: "advanced",
      };
    }
    throw new Error(`Fabric is at ${receipt.status} — cannot scan wash now.`);
  }

  if (station === "soak") {
    if (!receipt) throw new Error("Fabric receipt not found.");
    const stationError = fabricReceivingStationError(receipt, "soak");
    if (stationError) throw new Error(stationError);
    if (receipt.status === "received") {
      const updated = await startFabricReceiptPrep(receipt.id, "soak_iron");
      return {
        ...base,
        message: `Soak started — ${line.fabric_number}. Scan again at Soak when done, then Iron.`,
        receipt: updated,
        notice: "advanced",
      };
    }
    if (receipt.status === "fabric_prep" && receipt.fabric_prep_step === "soak") {
      const { receipt: updated } = await advanceFabricReceipt(receipt.id);
      return {
        ...base,
        message: `Soak complete — move to ironing (${line.fabric_number}).`,
        receipt: updated,
        notice: "advanced",
      };
    }
    throw new Error(`Fabric is at ${receipt.status} — cannot scan soak now.`);
  }

  if (station === "iron") {
    if (!receipt) throw new Error("Fabric receipt not found.");
    const stationError = fabricReceivingStationError(receipt, "iron");
    if (stationError) throw new Error(stationError);
    if (receipt.status === "received") {
      const updated = await startFabricReceiptPrep(receipt.id, "iron_only");
      return {
        ...base,
        message: `Ironing started — ${line.fabric_number}. Scan again at Iron when done.`,
        receipt: updated,
        notice: "advanced",
      };
    }
    if (receipt.status === "fabric_prep" && receipt.fabric_prep_step === "iron") {
      const { receipt: updated, work_orders } = await advanceFabricReceipt(receipt.id);
      const pieceNames = getGarmentPieces(line.garment_type);
      const message =
        pieceNames.length > 1
          ? `Ironing complete — stick ${work_orders.map((wo) => wo.piece_name).join(" + ") || pieceNames.join(" + ")} labels from the cutting pack, then scan at Cutting.`
          : `Ironing complete — ready for cutting. Scan the same fabric cut sticker at Cutting.`;
      return {
        ...base,
        message,
        receipt: updated,
        work_order: work_orders[0],
        notice: "advanced",
      };
    }
    throw new Error(`Fabric is at ${receipt.status}/${receipt.fabric_prep_step ?? "—"} — finish wash or soak first if needed.`);
  }

  const workOrder = getProductionWorkOrderBySticker(sticker.code);
  if (!workOrder) {
    throw new Error("Not on production floor yet — complete fabric prep (iron) first.");
  }

  if (station === "cutting") {
    if (workOrder.status !== "cutting") {
      return {
        ...base,
        message: `Checked in — currently at ${workOrder.status.replace(/_/g, " ")}.`,
        work_order: workOrder,
      };
    }
    return {
      ...base,
      message: `Cutting — ${sticker.piece_name} (${production_code}). Ready to cut.`,
      work_order: workOrder,
    };
  }

  if (station === "sewing") {
    if (workOrder.status === "cutting") {
      const updated = await advanceProductionWorkOrder(workOrder.id);
      return {
        ...base,
        message: `Cutting done — moved to sewing (${sticker.piece_name}).`,
        work_order: updated,
        notice: "advanced",
      };
    }
    if (workOrder.status === "sewing") {
      return {
        ...base,
        message: `Sewing — ${sticker.piece_name} (${production_code}).`,
        work_order: workOrder,
        notice: "checked_in",
      };
    }
    return {
      ...base,
      message: `At ${workOrder.status.replace(/_/g, " ")} — ${sticker.piece_name}.`,
      work_order: workOrder,
    };
  }

  if (station === "garment_wash") {
    if (workOrder.status === "sewing") {
      const updated = await advanceProductionWorkOrder(workOrder.id);
      return {
        ...base,
        message: `Sewing done — moved to garment wash (${sticker.piece_name}).`,
        work_order: updated,
        notice: "advanced",
      };
    }
    if (workOrder.status === "washing") {
      return {
        ...base,
        message: `Garment wash — ${sticker.piece_name} (${production_code}).`,
        work_order: workOrder,
        notice: "checked_in",
      };
    }
    return {
      ...base,
      message: `At ${workOrder.status.replace(/_/g, " ")} — ${sticker.piece_name}.`,
      work_order: workOrder,
    };
  }

  if (station === "finishing") {
    if (workOrder.status === "washing") {
      const updated = await advanceProductionWorkOrder(workOrder.id);
      return {
        ...base,
        message: `Garment wash done — moved to finishing (${sticker.piece_name}).`,
        work_order: updated,
        notice: "advanced",
      };
    }
    if (workOrder.status === "finishing") {
      return {
        ...base,
        message: `Finishing — ${sticker.piece_name} (${production_code}).`,
        work_order: workOrder,
        notice: "checked_in",
      };
    }
    return {
      ...base,
      message: `At ${workOrder.status.replace(/_/g, " ")} — ${sticker.piece_name}.`,
      work_order: workOrder,
    };
  }

  if (station === "packed") {
    if (workOrder.status === "finishing") {
      const updated = await advanceProductionWorkOrder(workOrder.id);
      return {
        ...base,
        message: `Finishing done — moved to packed (${sticker.piece_name}).`,
        work_order: updated,
        notice: "advanced",
      };
    }
    if (workOrder.status === "packed") {
      return {
        ...base,
        message: `Packed — ${sticker.piece_name} (${production_code}).`,
        work_order: workOrder,
        notice: "checked_in",
      };
    }
    return {
      ...base,
      message: `At ${workOrder.status.replace(/_/g, " ")} — ${sticker.piece_name}.`,
      work_order: workOrder,
    };
  }

  throw new Error("Unknown station.");
}

/** Fabric Receiving — operator picks Receive / Wash / Soak / Iron; no auto-routing. */
export async function scanAtFabricReceivingStation(
  scanInput: string,
  station: ScanStation
): Promise<StageScanResult> {
  if (!isFabricReceivingStation(station)) {
    throw new Error("Invalid fabric receiving station — use Receive, Wash, Soak, or Iron.");
  }

  const lookup = resolveScanToLine(scanInput);
  if (!lookup) {
    throw new Error("Sticker code not recognized — check client + production code on the label.");
  }

  const receipt = getFabricReceiptByLineId(lookup.line.id);
  const hasProductionWork =
    readProductionWorkOrders().work_orders.some(
      (workOrder) => workOrder.sales_order_line_id === lookup.line.id
    ) ?? false;

  if (receipt?.status === "handed_off" || (!receipt && hasProductionWork)) {
    throw new Error("Fabric prep is complete — this cut is on Production now.");
  }

  return scanAtStation(scanInput, station);
}

/** Status before a scan mutates receipt or work order — for audit events. */
export function statusBeforeScan(scanInput: string, station: ScanStation): string | null {
  const lookup = resolveScanToLine(scanInput);
  if (!lookup) return null;

  if (station === "receive") {
    const receipt = getFabricReceiptByLineId(lookup.line.id);
    return receipt ? receipt.status : "pending";
  }

  if (isFabricReceivingStation(station)) {
    const receipt = getFabricReceiptByLineId(lookup.line.id);
    return receipt?.status ?? null;
  }

  const workOrder = getProductionWorkOrderBySticker(lookup.sticker.code);
  return workOrder?.status ?? null;
}
