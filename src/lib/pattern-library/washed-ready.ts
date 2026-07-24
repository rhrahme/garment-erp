import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readFabricReceipts, readFabricReceiptsArchive } from "@/lib/data/fabric-receipts";
import type { FabricReceipt } from "@/lib/types/fabric-receipts";

export interface WashedReadyRow {
  receipt_id: string;
  sales_order_id: string;
  so_number: string;
  sales_order_line_id: string;
  client_code: string;
  client_name: string;
  garment_type: string;
  fabric_number: string;
  supplier_name: string;
  fabric_meters: number;
  status: string;
  prep_type: string | null;
  prep_step: string | null;
  received_at: string;
  handed_off_at: string | null;
}

export interface WashedReadyOverview {
  /** Prep complete (wash/iron done, handed off) — fabric is ready to cut. */
  ready: WashedReadyRow[];
  /** Still in wash/soak/dry/iron, or received and waiting for prep to start. */
  pending: WashedReadyRow[];
}

const READY_WINDOW_DAYS = 60;
const READY_ROW_CAP = 100;

function toRow(receipt: FabricReceipt): WashedReadyRow {
  return {
    receipt_id: receipt.id,
    sales_order_id: receipt.sales_order_id,
    so_number: receipt.so_number,
    sales_order_line_id: receipt.sales_order_line_id,
    client_code: receipt.client_code,
    client_name: receipt.client_name,
    garment_type: receipt.garment_type,
    fabric_number: receipt.fabric_number,
    supplier_name: receipt.supplier_name,
    fabric_meters: receipt.fabric_meters,
    status: receipt.status,
    prep_type: receipt.fabric_prep_type ?? null,
    prep_step: receipt.fabric_prep_step ?? null,
    received_at: receipt.received_at,
    handed_off_at: receipt.handed_off_at ?? null,
  };
}

export async function buildWashedReadyOverview(): Promise<WashedReadyOverview> {
  await ensureDocumentsLoaded(["fabric_receipts", "fabric_receipts_archive"]);
  const active = readFabricReceipts().receipts;
  const archived = readFabricReceiptsArchive().receipts;

  const cutoff = Date.now() - READY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const seen = new Set<string>();
  const ready: WashedReadyRow[] = [];
  for (const receipt of [...active, ...archived]) {
    if (receipt.status !== "handed_off" || seen.has(receipt.id)) continue;
    seen.add(receipt.id);
    const handedOff = receipt.handed_off_at ? Date.parse(receipt.handed_off_at) : NaN;
    if (Number.isFinite(handedOff) && handedOff < cutoff) continue;
    ready.push(toRow(receipt));
  }
  ready.sort((a, b) => (b.handed_off_at ?? "").localeCompare(a.handed_off_at ?? ""));

  const pending = active
    .filter((receipt) => receipt.status === "received" || receipt.status === "fabric_prep")
    .map(toRow)
    .sort((a, b) => a.received_at.localeCompare(b.received_at));

  return { ready: ready.slice(0, READY_ROW_CAP), pending };
}
