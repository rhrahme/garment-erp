/**
 * Keep clients.json / erp_documents.clients aligned with sales orders.
 * Mirrors src/lib/clients/orphan-reconciliation.ts — update both when changing.
 *
 * Invariant: client profiles cannot be dropped while sales orders still
 * reference them (by client_id). Prefer append/restore over delete.
 */

function normalizePart(value) {
  return String(value ?? "").trim();
}

function migrateDisplayName(rawName) {
  const legacyName = normalizePart(rawName);
  if (!legacyName) {
    return { first_name: "Unknown", middle_name: null, last_name: "Client" };
  }
  const parts = legacyName.split(/\s+/);
  if (parts.length === 1) {
    return { first_name: parts[0], middle_name: null, last_name: "Client" };
  }
  return {
    first_name: parts[0],
    middle_name: parts.length > 2 ? parts.slice(1, -1).join(" ") : null,
    last_name: parts[parts.length - 1],
  };
}

const BRAND_CLIENT_CODE_PREFIX = {
  gliani: "GL",
  "fouad-rahme": "FR",
  fouad: "FD",
  "just-uniforms": "JU",
};

function brandIdFromClientCode(code) {
  const prefix = normalizePart(code).toUpperCase().split("-")[0] ?? "";
  const entry = Object.entries(BRAND_CLIENT_CODE_PREFIX).find(([, value]) => value === prefix);
  return entry?.[0] ?? "fouad-rahme";
}

export function findOrphanedSalesOrderClients(clients, orders) {
  const byId = new Map((clients ?? []).map((client) => [client.id, client]));
  const groups = new Map();

  for (const order of orders ?? []) {
    const clientId = normalizePart(order.client_id);
    if (!clientId || byId.has(clientId)) continue;

    const existing = groups.get(clientId);
    if (existing) {
      existing.order_ids.push(order.id);
      existing.so_numbers.push(order.so_number);
      if (order.order_date && (!existing.earliest_order_date || order.order_date < existing.earliest_order_date)) {
        existing.earliest_order_date = order.order_date;
      }
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

  return [...groups.values()];
}

export function buildClientProfileFromOrphan(orphan) {
  const code = normalizePart(orphan.client_code).toUpperCase();
  const name = normalizePart(orphan.client_name);
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

export function retainClientsLinkedToSalesOrders(previousClients, nextClients, orders) {
  const nextIds = new Set((nextClients ?? []).map((client) => client.id));
  const linkedIds = new Set((orders ?? []).map((order) => normalizePart(order.client_id)).filter(Boolean));
  const previousById = new Map((previousClients ?? []).map((client) => [client.id, client]));
  const retained = [];

  for (const clientId of linkedIds) {
    if (nextIds.has(clientId)) continue;
    const previous = previousById.get(clientId);
    if (!previous) continue;
    retained.push(previous);
    nextIds.add(clientId);
  }

  if (retained.length === 0) {
    return { clients: nextClients ?? [], retained: [] };
  }
  return { clients: [...(nextClients ?? []), ...retained], retained };
}

export function reconcileOrphanedClients(clients, orders) {
  const orphans = findOrphanedSalesOrderClients(clients, orders);
  if (orphans.length === 0) {
    return { clients, restored: [], skipped: [], orphans: [] };
  }

  const usedCodes = new Set((clients ?? []).map((client) => client.code));
  const restored = [];
  const skipped = [];

  for (const orphan of orphans) {
    if (usedCodes.has(orphan.client_code)) {
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
    clients: [...(clients ?? []), ...restored],
    restored,
    skipped,
    orphans,
  };
}

export function prepareClientsForPersist(previousClients, nextClients, orders) {
  const retainedResult = retainClientsLinkedToSalesOrders(previousClients, nextClients, orders);
  const reconciled = reconcileOrphanedClients(retainedResult.clients, orders);
  return {
    clients: reconciled.clients,
    retained: retainedResult.retained,
    restored: reconciled.restored,
    skipped: reconciled.skipped,
  };
}

/**
 * Before writing clients FROM Supabase over local files: retain any local profiles
 * still referenced by sales orders (remote or local), and heal orphans.
 */
export function protectLocalClientsFromStaleRemote(remoteClientsFile, localClientsFile, salesOrdersFile) {
  const remoteClients = remoteClientsFile?.clients ?? [];
  const localClients = localClientsFile?.clients ?? [];
  const orders = salesOrdersFile?.orders ?? [];
  const prepared = prepareClientsForPersist(localClients, remoteClients, orders);
  return {
    file: {
      ...(remoteClientsFile ?? { updated_at: null }),
      clients: prepared.clients,
    },
    retained: prepared.retained,
    restored: prepared.restored,
    skipped: prepared.skipped,
  };
}
