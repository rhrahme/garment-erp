import { getFabricReceiptByLineId, getFabricReceiptByLineIdFresh } from "@/lib/data/fabric-receipts";
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
  expandFabricLabelScanInput,
  fabricLineArticleNumber,
  productionCodeFromSticker,
  supplierFabricProductionCode,
} from "@/lib/sales-orders/label-codes";
import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import {
  fabricReceiveRescanHint,
  isFabricReceivingStation,
  planFabricStationScan,
  type FabricPrepStation,
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
  client_name: string;
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
  for (const candidate of expandFabricLabelScanInput(scanInput)) {
    const direct = findStickerInSalesOrders(candidate);
    if (direct) return direct;

    const normalized = normalizeScan(candidate);
    if (!normalized) continue;

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
    client_name: order.client_name?.trim() || "—",
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
    if (result.created) {
      return {
        ...base,
        message: `Received — ${supplierLabel} ${line.fabric_number} (${line.garment_type}).`,
        notice: "created",
        receipt: result.receipt,
      };
    }
    const prepHint = fabricReceiveRescanHint(result.receipt);
    return {
      ...base,
      message: prepHint
        ? `${prepHint} (${line.fabric_number}).`
        : `Already received — ${supplierLabel} ${line.fabric_number}. Select Wash, Soak, or Iron, then scan again.`,
      notice: "already_received",
      receipt: result.receipt,
    };
  }

  if (station === "wash" || station === "soak" || station === "iron") {
    // Fresh lookup — a stale/cold instance cache must never report a received
    // fabric as "not received" (the receipt may have been written via another
    // instance seconds ago).
    const receipt = await getFabricReceiptByLineIdFresh(line.id);
    const plan = planFabricStationScan(receipt, station as FabricPrepStation);

    if (plan.kind === "reject") {
      throw new Error(plan.message);
    }

    if (plan.kind === "start_prep") {
      const updated = await startFabricReceiptPrep(receipt!.id, plan.prep_type);
      const message =
        station === "wash"
          ? `Wash started — ${line.fabric_number}. When it comes out of the machine: scan again at Wash to hang to dry (or tap Finish wash → hang to dry).`
          : station === "soak"
            ? `Soak started — ${line.fabric_number}. When it comes out of the bowl: scan again at Soak to hang to dry (or tap Finish soak → hang to dry).`
            : `Ironing started — ${line.fabric_number} (iron only). Scan again at Iron when done.`;
      return { ...base, message, receipt: updated, notice: "advanced" };
    }

    // plan.kind === "advance" — second scan for the current step.
    const { receipt: updated, work_orders } = await advanceFabricReceipt(receipt!.id);
    if (plan.from === "wash" || plan.from === "soak") {
      return {
        ...base,
        message: `${plan.from === "wash" ? "Wash" : "Soak"} done — hung to dry (${line.fabric_number}). Station switched to Iron — scan at Iron when it's dry to start ironing.`,
        receipt: updated,
        notice: "advanced",
      };
    }
    if (plan.from === "drying") {
      return {
        ...base,
        message: `Dry — ironing started (${line.fabric_number}). Scan again at Iron when ironing is done.`,
        receipt: updated,
        notice: "advanced",
      };
    }
    // plan.from === "iron" — prep finished, handed off to cutting.
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

  // Fresh lookup — also re-warms the receipts cache so the station handlers
  // inside scanAtStation see the same authoritative state.
  const receipt = await getFabricReceiptByLineIdFresh(lookup.line.id);
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
