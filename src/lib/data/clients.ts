import path from "path";
import {
  healSalesOrderClientFields,
  prepareClientsForPersist,
  reconcileOrphanedClients,
  retainClientsLinkedToSalesOrders,
  type OrphanReconciliationResult,
  type PrepareClientsForPersistResult,
  type SalesOrderClientFieldRepair,
} from "@/lib/clients/orphan-reconciliation";
import { ensureDocumentsLoaded, readJsonFile, readJsonFileAsync, saveDocument } from "@/lib/data/document-persistence";
import { readSalesOrders, readSalesOrdersFresh, writeSalesOrders } from "@/lib/data/sales-orders";
import type { ClientProfile, ClientsFile } from "@/lib/types/clients";

const CLIENTS_PATH = path.join(process.cwd(), "src/data/clients.json");
const EMPTY_CLIENTS: ClientsFile = { updated_at: null, clients: [] };

export type WriteClientsResult = ClientsFile & {
  retained: ClientProfile[];
  restored: ClientProfile[];
  skipped_orphan_count: number;
};

export async function readClientsAsync(): Promise<ClientsFile> {
  return readJsonFileAsync(CLIENTS_PATH, EMPTY_CLIENTS);
}

export function readClients(): ClientsFile {
  return readJsonFile(CLIENTS_PATH, EMPTY_CLIENTS);
}

/** Raw persist after guards/delete checks — do not call from API routes. */
async function persistClientsFile(data: ClientsFile): Promise<ClientsFile> {
  const payload: ClientsFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return saveDocument(CLIENTS_PATH, payload);
}

/**
 * THE only write path for replacing/saving the clients list.
 * Always retains profiles linked to sales orders and auto-heals missing ones
 * from denormalized order fields before persisting.
 */
export async function writeClients(data: ClientsFile): Promise<WriteClientsResult> {
  await ensureDocumentsLoaded(["clients", "sales_orders"]);
  const previous = readClients();
  const prepared = prepareClientsForPersist(previous.clients, data.clients, readSalesOrders().orders);

  if (prepared.retained.length > 0) {
    console.warn(
      `[clients] Retained ${prepared.retained.length} linked client(s) omitted from save:`,
      prepared.retained.map((client) => `${client.code} (${client.id})`).join(", ")
    );
  }
  if (prepared.restored.length > 0) {
    console.warn(
      `[clients] Restored ${prepared.restored.length} orphaned client profile(s) from sales orders:`,
      prepared.restored.map((client) => `${client.code} (${client.id})`).join(", ")
    );
  }

  const saved = await persistClientsFile({ ...data, clients: prepared.clients });
  return {
    ...saved,
    retained: prepared.retained,
    restored: prepared.restored,
    skipped_orphan_count: prepared.skipped.length,
  };
}

export type ClientDataHealResult = OrphanReconciliationResult & {
  repaired_orders: SalesOrderClientFieldRepair[];
};

/**
 * Restore client profiles for any sales-order client_id that is missing from the
 * clients store, then fill blank denormalized client_name / client_code on orders
 * from the clients store (repair-only). Persists when repairs are needed so
 * Clients, Fabric Receiving, and Print orders cannot diverge on any read path.
 */
export async function ensureOrphanedClientsReconciled(): Promise<ClientDataHealResult> {
  await ensureDocumentsLoaded(["clients", "sales_orders"]);
  const store = readClients();
  const ordersStore = readSalesOrders();
  const result = reconcileOrphanedClients(store.clients, ordersStore.orders);
  if (result.restored.length > 0) {
    // Persist via raw path — reconcile already applied; avoid double timestamp bumps
    // when writeClients would re-run the same heal.
    await persistClientsFile({ ...store, clients: result.clients });
    console.warn(
      `[clients] Auto-healed ${result.restored.length} orphaned client profile(s):`,
      result.restored.map((client) => `${client.code} (${client.id})`).join(", ")
    );
  }

  const healed = healSalesOrderClientFields(ordersStore.orders, result.clients);
  if (healed.repaired.length > 0) {
    await writeSalesOrders({ ...ordersStore, orders: healed.orders });
    console.warn(
      `[clients] Repaired blank client fields on ${healed.repaired.length} sales order(s):`,
      healed.repaired.map((repair) => `${repair.so_number} → ${repair.client_name}`).join(", ")
    );
  }

  return { ...result, repaired_orders: healed.repaired };
}

/** Guard bulk client saves from dropping profiles that still have sales orders. */
export function protectLinkedClientsOnSave(
  previousClients: ClientProfile[],
  nextClients: ClientProfile[]
): { clients: ClientProfile[]; retained: ClientProfile[] } {
  return retainClientsLinkedToSalesOrders(previousClients, nextClients, readSalesOrders().orders);
}

/** Full save gate (retain + heal). Prefer writeClients for persistence. */
export function prepareClientsSave(
  previousClients: ClientProfile[],
  nextClients: ClientProfile[]
): PrepareClientsForPersistResult {
  return prepareClientsForPersist(previousClients, nextClients, readSalesOrders().orders);
}

export function getActiveClients(): ClientProfile[] {
  return readClients().clients.filter((client) => client.is_active);
}

export function getClientById(id: string): ClientProfile | undefined {
  return readClients().clients.find((client) => client.id === id);
}

export function getClientByCode(code: string): ClientProfile | undefined {
  return readClients().clients.find((client) => client.code === code);
}

export function normalizeClientCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

export function slugifyClientId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function deleteClientById(
  id: string
): Promise<{ ok: true; client: ClientProfile } | { ok: false; error: string; status?: number }> {
  await ensureDocumentsLoaded(["clients", "sales_orders"]);
  // Always re-read sales orders so a stale local JSON fallback cannot allow
  // deleting a client that still has remote fabric / SO activity.
  const linkedOrders = (await readSalesOrdersFresh()).orders.filter((order) => order.client_id === id);
  if (linkedOrders.length > 0) {
    return {
      ok: false,
      status: 409,
      error: `Cannot delete client with ${linkedOrders.length} linked sales order(s). Remove or reassign orders first.`,
    };
  }

  const data = readClients();
  const index = data.clients.findIndex((client) => client.id === id);
  if (index < 0) {
    return { ok: false, status: 404, error: "Client not found." };
  }

  const [removed] = data.clients.splice(index, 1);
  // Use raw persist — writeClients would retain this id if any order still linked
  // (already checked above). Retaining here would make delete appear to succeed
  // while silently keeping the row.
  await persistClientsFile({ ...data, clients: data.clients });
  return { ok: true, client: removed };
}
