import path from "path";
import {
  reconcileOrphanedClients,
  retainClientsLinkedToSalesOrders,
  type OrphanReconciliationResult,
} from "@/lib/clients/orphan-reconciliation";
import { ensureDocumentsLoaded, readJsonFile, readJsonFileAsync, saveDocument } from "@/lib/data/document-persistence";
import { readSalesOrders } from "@/lib/data/sales-orders";
import type { ClientProfile, ClientsFile } from "@/lib/types/clients";

const CLIENTS_PATH = path.join(process.cwd(), "src/data/clients.json");
const EMPTY_CLIENTS: ClientsFile = { updated_at: null, clients: [] };

export async function readClientsAsync(): Promise<ClientsFile> {
  return readJsonFileAsync(CLIENTS_PATH, EMPTY_CLIENTS);
}

export function readClients(): ClientsFile {
  return readJsonFile(CLIENTS_PATH, EMPTY_CLIENTS);
}

export async function writeClients(data: ClientsFile): Promise<ClientsFile> {
  const payload: ClientsFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return saveDocument(CLIENTS_PATH, payload);
}

/**
 * Restore client profiles for any sales-order client_id that is missing from the
 * clients store. Persists when restorals are needed so Clients and Fabric Receiving
 * cannot diverge.
 */
export async function ensureOrphanedClientsReconciled(): Promise<OrphanReconciliationResult> {
  await ensureDocumentsLoaded(["clients", "sales_orders"]);
  const store = readClients();
  const result = reconcileOrphanedClients(store.clients, readSalesOrders().orders);
  if (result.restored.length === 0) {
    return result;
  }
  const saved = await writeClients({ ...store, clients: result.clients });
  return { ...result, clients: saved.clients };
}

/** Guard bulk client saves from dropping profiles that still have sales orders. */
export function protectLinkedClientsOnSave(
  previousClients: ClientProfile[],
  nextClients: ClientProfile[]
): { clients: ClientProfile[]; retained: ClientProfile[] } {
  return retainClientsLinkedToSalesOrders(previousClients, nextClients, readSalesOrders().orders);
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
): Promise<{ ok: true; client: ClientProfile } | { ok: false; error: string }> {
  await ensureDocumentsLoaded(["clients"]);
  const data = readClients();
  const index = data.clients.findIndex((client) => client.id === id);
  if (index < 0) {
    return { ok: false, error: "Client not found." };
  }

  const [removed] = data.clients.splice(index, 1);
  await writeClients({ ...data, clients: data.clients });
  return { ok: true, client: removed };
}
