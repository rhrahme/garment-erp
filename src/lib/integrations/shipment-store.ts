import path from "path";
import { ensureDocumentsLoaded, readJsonFile, writeJsonFile } from "@/lib/data/json-file-cache";

const STORE_PATH = path.join(process.cwd(), "shipments.local.json");

export interface ShipmentRecord {
  id: string;
  awb_number: string;
  carrier: string;
  purchase_order_id: string | null;
  po_number: string | null;
  status: string;
  direction: "inbound" | "outbound";
  estimated_arrival: string | null;
  created_at: string;
  /** 17TRACK carrier code (e.g. 100001 = DHL Express). */
  track17_carrier_code?: number | null;
  track17_registered?: boolean;
  /** Raw 17TRACK package status (InTransit, Delivered, …). */
  tracking_status?: string | null;
  current_location?: string | null;
  latest_event?: string | null;
  latest_event_at?: string | null;
  delivered_at?: string | null;
  tracking_updated_at?: string | null;
  tracking_url?: string | null;
}

interface ShipmentStore {
  shipments: ShipmentRecord[];
}

/** Warm the lazy `shipments` document from Supabase before sync reads/writes. */
export async function ensureShipmentsLoaded(): Promise<void> {
  await ensureDocumentsLoaded(["shipments"]);
}

function readStore(): ShipmentStore {
  return readJsonFile(STORE_PATH, { shipments: [] });
}

function writeStore(store: ShipmentStore): void {
  writeJsonFile(STORE_PATH, store);
}

export function createShipment(input: Omit<ShipmentRecord, "id" | "created_at">): ShipmentRecord {
  const store = readStore();
  const record: ShipmentRecord = {
    id: `ship-${Date.now()}`,
    created_at: new Date().toISOString(),
    track17_registered: false,
    ...input,
  };
  store.shipments.unshift(record);
  writeStore(store);
  return record;
}

export function listStoredShipments(): ShipmentRecord[] {
  return readStore().shipments;
}

export function getShipmentById(id: string): ShipmentRecord | undefined {
  return readStore().shipments.find((shipment) => shipment.id === id);
}

export function getShipmentByAwb(awbNumber: string): ShipmentRecord | undefined {
  const normalized = awbNumber.trim().toUpperCase();
  return readStore().shipments.find((shipment) => shipment.awb_number.toUpperCase() === normalized);
}

export function updateShipmentById(
  id: string,
  patch: Partial<Omit<ShipmentRecord, "id" | "created_at">>
): ShipmentRecord | undefined {
  const store = readStore();
  const index = store.shipments.findIndex((shipment) => shipment.id === id);
  if (index < 0) return undefined;

  store.shipments[index] = { ...store.shipments[index], ...patch };
  writeStore(store);
  return store.shipments[index];
}

export function deleteShipmentByAwb(awbNumber: string): boolean {
  const store = readStore();
  const normalized = awbNumber.trim().toUpperCase();
  const next = store.shipments.filter((shipment) => shipment.awb_number.toUpperCase() !== normalized);
  if (next.length === store.shipments.length) return false;
  writeStore({ shipments: next });
  return true;
}
