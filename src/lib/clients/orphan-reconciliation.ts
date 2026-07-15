import type { ClientProfile } from "../types/clients";
import type { SalesOrder } from "../types/sales-orders";

export const UNASSIGNED_CLIENT_SECTION_KEY = "__unassigned__";
export const UNASSIGNED_CLIENT_LABEL = "Unassigned client";

const BRAND_CLIENT_CODE_PREFIX: Record<string, string> = {
  gliani: "GL",
  "fouad-rahme": "FR",
  fouad: "FD",
  "just-uniforms": "JU",
};

export type OrphanSalesOrder = Pick<
  SalesOrder,
  "id" | "so_number" | "client_id" | "client_code" | "client_name" | "order_date"
>;

export type OrphanClientGroup = {
  client_id: string;
  client_code: string;
  client_name: string;
  order_ids: string[];
  so_numbers: string[];
  earliest_order_date: string | null;
};

export type OrphanReconciliationResult = {
  clients: ClientProfile[];
  restored: ClientProfile[];
  /** Orphans that could not be restored (e.g. code already owned by another profile). Orders are never deleted. */
  skipped: OrphanClientGroup[];
  orphans: OrphanClientGroup[];
};

function normalizePart(value: unknown): string {
  return String(value ?? "").trim();
}

function migrateDisplayName(rawName: string): {
  first_name: string;
  middle_name: string | null;
  last_name: string;
} {
  const legacyName = normalizePart(rawName);
  if (!legacyName) {
    return { first_name: "Unknown", middle_name: null, last_name: "Client" };
  }
  const parts = legacyName.split(/\s+/);
  if (parts.length === 1) {
    return { first_name: parts[0]!, middle_name: null, last_name: "Client" };
  }
  return {
    first_name: parts[0]!,
    middle_name: parts.length > 2 ? parts.slice(1, -1).join(" ") : null,
    last_name: parts[parts.length - 1]!,
  };
}

function brandIdFromClientCode(code: string): string {
  const prefix = normalizePart(code).toUpperCase().split("-")[0] ?? "";
  const entry = Object.entries(BRAND_CLIENT_CODE_PREFIX).find(([, value]) => value === prefix);
  return entry?.[0] ?? "fouad-rahme";
}

/** Sales orders whose client_id is missing from the clients store. Never mutates orders. */
export function findOrphanedSalesOrderClients(
  clients: ClientProfile[],
  orders: OrphanSalesOrder[]
): OrphanClientGroup[] {
  const byId = new Map(clients.map((client) => [client.id, client]));
  const groups = new Map<string, OrphanClientGroup>();

  for (const order of orders) {
    const clientId = normalizePart(order.client_id);
    if (!clientId || byId.has(clientId)) continue;

    const existing = groups.get(clientId);
    if (existing) {
      existing.order_ids.push(order.id);
      existing.so_numbers.push(order.so_number);
      if (order.order_date && (!existing.earliest_order_date || order.order_date < existing.earliest_order_date)) {
        existing.earliest_order_date = order.order_date;
      }
      // Prefer non-empty denormalized fields — never blank over a populated value.
      if (normalizePart(order.client_code) && !existing.client_code) {
        existing.client_code = normalizePart(order.client_code);
      }
      if (normalizePart(order.client_name) && !existing.client_name) {
        existing.client_name = normalizePart(order.client_name);
      }
      continue;
    }

    groups.set(clientId, {
      client_id: clientId,
      client_code: normalizePart(order.client_code),
      client_name: normalizePart(order.client_name),
      order_ids: [order.id],
      so_numbers: [order.so_number],
      earliest_order_date: order.order_date ?? null,
    });
  }

  return [...groups.values()].sort((a, b) => a.client_code.localeCompare(b.client_code));
}

/**
 * Rebuild a client profile from denormalized sales-order fields.
 * Preserves the original client_id and client_code from orders — never invents new ones.
 */
export function buildClientProfileFromOrphan(orphan: OrphanClientGroup): ClientProfile | null {
  const code = normalizePart(orphan.client_code).toUpperCase();
  const name = normalizePart(orphan.client_name);
  // Require both code and name so we never re-create a blank/empty profile.
  if (!code || !name) return null;

  const names = migrateDisplayName(name);
  const joined_at = orphan.earliest_order_date
    ? new Date(`${orphan.earliest_order_date}T00:00:00.000Z`).toISOString()
    : new Date().toISOString();

  return {
    id: orphan.client_id,
    code,
    joined_at,
    first_name: names.first_name,
    middle_name: names.middle_name,
    last_name: names.last_name,
    brand_ids: [brandIdFromClientCode(code)],
    contact_person: null,
    referred_by_first_name: null,
    referred_by_middle_name: null,
    referred_by_last_name: null,
    email: null,
    phone: null,
    country: null,
    city: null,
    address: null,
    payment_terms: null,
    client_reference_prefix: null,
    notes: `Restored from sales orders (${orphan.so_numbers.join(", ")}) — client profile was missing while orders still referenced this client.`,
    is_active: true,
    client_kind: "person",
  };
}

/**
 * Restore any sales-order client_ids that are missing from the clients store.
 * APPEND-ONLY for the clients list — never removes existing profiles or orders.
 */
export function reconcileOrphanedClients(
  clients: ClientProfile[],
  orders: OrphanSalesOrder[]
): OrphanReconciliationResult {
  const orphans = findOrphanedSalesOrderClients(clients, orders);
  if (orphans.length === 0) {
    return { clients, restored: [], skipped: [], orphans: [] };
  }

  const usedCodes = new Set(clients.map((client) => client.code));
  const restored: ClientProfile[] = [];
  const skipped: OrphanClientGroup[] = [];

  for (const orphan of orphans) {
    if (usedCodes.has(orphan.client_code)) {
      // Do not invent a colliding code and do not delete/reassign orders automatically.
      skipped.push(orphan);
      continue;
    }
    const profile = buildClientProfileFromOrphan(orphan);
    if (!profile) {
      skipped.push(orphan);
      continue;
    }
    restored.push(profile);
    usedCodes.add(profile.code);
  }

  return {
    clients: [...clients, ...restored],
    restored,
    skipped,
    orphans,
  };
}

/**
 * Keep any previously-saved clients that still have linked sales orders when a bulk PUT omits them.
 * Recovery path: never drop a linked profile.
 */
export function retainClientsLinkedToSalesOrders(
  previousClients: ClientProfile[],
  nextClients: ClientProfile[],
  orders: OrphanSalesOrder[]
): { clients: ClientProfile[]; retained: ClientProfile[] } {
  const nextIds = new Set(nextClients.map((client) => client.id));
  const linkedIds = new Set(orders.map((order) => normalizePart(order.client_id)).filter(Boolean));
  const previousById = new Map(previousClients.map((client) => [client.id, client]));
  const retained: ClientProfile[] = [];

  for (const clientId of linkedIds) {
    if (nextIds.has(clientId)) continue;
    const previous = previousById.get(clientId);
    if (!previous) continue;
    retained.push(previous);
    nextIds.add(clientId);
  }

  if (retained.length === 0) {
    return { clients: nextClients, retained: [] };
  }

  return { clients: [...nextClients, ...retained], retained };
}

export function fabricReceivingClientSectionKey(
  clientCode: string | null | undefined,
  clientName?: string | null
): string {
  const code = normalizePart(clientCode);
  if (code) return code;
  const name = normalizePart(clientName);
  if (name) return `name:${name.toLowerCase()}`;
  return UNASSIGNED_CLIENT_SECTION_KEY;
}

export function fabricReceivingClientSectionLabel(
  clientCode: string | null | undefined,
  clientName?: string | null
): { client_code: string; client_name: string } {
  const code = normalizePart(clientCode);
  const name = normalizePart(clientName);
  if (!code && !name) {
    return { client_code: "—", client_name: UNASSIGNED_CLIENT_LABEL };
  }
  return {
    client_code: code || "—",
    client_name: name || code,
  };
}

export function orderMatchesBrandClientPrefix(
  clientCode: string | null | undefined,
  brandPrefix: string
): boolean {
  const code = normalizePart(clientCode);
  if (!code) return true; // always show unassigned / missing-code activity
  return code.startsWith(`${brandPrefix}-`) || code === brandPrefix;
}
