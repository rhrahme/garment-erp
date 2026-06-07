import path from "path";
import { ensureDocumentsLoaded, loadDocument, readJsonFile, saveDocument } from "@/lib/data/document-persistence";
import type { ClientProfile, ClientsFile } from "@/lib/types/clients";

const CLIENTS_PATH = path.join(process.cwd(), "src/data/clients.json");
const EMPTY_CLIENTS: ClientsFile = { updated_at: null, clients: [] };

export async function readClientsAsync(): Promise<ClientsFile> {
  return loadDocument(CLIENTS_PATH, EMPTY_CLIENTS);
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
