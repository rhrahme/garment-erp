import type { SessionContext } from "@/lib/auth/session";
import { filterClientsByBrand } from "@/lib/clients/filter";
import { getBrandClientCodePrefix } from "@/lib/clients/codes";
import { getClientById, readClients } from "@/lib/data/clients";
import type { ClientProfile } from "@/lib/types/clients";
import type { SalesOrder } from "@/lib/types/sales-orders";

/**
 * Env map: `SALES_BRAND_SCOPE=sales1@hagan.pro:gliani,sales2@x.com:fouad|fouad-rahme`
 * - Entries comma-separated
 * - Each entry `email:brand` or `email:brand1|brand2`
 * - Sales emails omitted from the map keep all-brand access (null allow-list)
 */
export function parseSalesBrandScope(
  raw: string | undefined = process.env.SALES_BRAND_SCOPE
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const text = raw?.trim() ?? "";
  if (!text) return map;

  for (const entry of text.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const email = trimmed.slice(0, colon).trim().toLowerCase();
    const brands = trimmed
      .slice(colon + 1)
      .split("|")
      .map((brand) => brand.trim().toLowerCase())
      .filter(Boolean);
    if (!email || brands.length === 0) continue;
    map.set(email, [...new Set(brands)]);
  }
  return map;
}

/**
 * Brands this sales user is allowed to work with.
 * `null` = all brands (no per-user assignment, or non-sales role).
 */
export function getAllowedSalesBrandIds(
  session: Pick<SessionContext, "email" | "isSalesOperator">
): string[] | null {
  if (!session.isSalesOperator) return null;
  const email = session.email?.trim().toLowerCase();
  if (!email) return null;
  return parseSalesBrandScope().get(email) ?? null;
}

export function clientMatchesSalesBrandScope(
  client: Pick<ClientProfile, "brand_ids">,
  allowedBrandIds: string[] | null
): boolean {
  if (!allowedBrandIds) return true;
  const allowed = new Set(allowedBrandIds);
  return client.brand_ids.some((id) => allowed.has(id));
}

/** Apply sales-user → brand scoping; no-op while allow-list is null. */
export function filterClientsForSalesBrandScope(
  clients: ClientProfile[],
  allowedBrandIds: string[] | null
): ClientProfile[] {
  if (!allowedBrandIds) return clients;
  return clients.filter((client) => clientMatchesSalesBrandScope(client, allowedBrandIds));
}

/** UI brand tab filter on top of optional sales brand scoping. */
export function filterSalesClientsByBrand(
  clients: ClientProfile[],
  brandFilter: string | null,
  allowedBrandIds: string[] | null = null
): ClientProfile[] {
  return filterClientsByBrand(filterClientsForSalesBrandScope(clients, allowedBrandIds), brandFilter);
}

export function canAccessClient(
  session: Pick<SessionContext, "email" | "isSalesOperator">,
  client: Pick<ClientProfile, "brand_ids"> | null | undefined
): boolean {
  if (!session.isSalesOperator) return true;
  if (!client) return false;
  return clientMatchesSalesBrandScope(client, getAllowedSalesBrandIds(session));
}

function orderMatchesBrandScope(
  order: Pick<SalesOrder, "client_id" | "client_code">,
  allowedBrandIds: string[],
  clientsById?: Map<string, Pick<ClientProfile, "brand_ids">>
): boolean {
  const fromMap = clientsById?.get(order.client_id);
  const client = fromMap ?? getClientById(order.client_id);
  if (client) return clientMatchesSalesBrandScope(client, allowedBrandIds);

  // Fallback when client row is missing: match client code brand prefix (e.g. GL-…).
  const code = order.client_code?.trim().toUpperCase() ?? "";
  return allowedBrandIds.some((brandId) => {
    const prefix = getBrandClientCodePrefix(brandId)?.toUpperCase();
    return Boolean(prefix && (code === prefix || code.startsWith(`${prefix}-`)));
  });
}

export function canAccessSalesOrder(
  session: Pick<SessionContext, "email" | "isSalesOperator">,
  order: SalesOrder,
  clientsById?: Map<string, Pick<ClientProfile, "brand_ids">>
): boolean {
  if (!session.isSalesOperator) return true;

  const owner = order.sales_owner_email?.trim().toLowerCase();
  if (!owner || owner !== session.email?.trim().toLowerCase()) return false;

  const allowedBrandIds = getAllowedSalesBrandIds(session);
  if (!allowedBrandIds) return true;
  return orderMatchesBrandScope(order, allowedBrandIds, clientsById);
}

export function filterSalesOrdersForSession(
  session: Pick<SessionContext, "email" | "isSalesOperator">,
  orders: SalesOrder[],
  clients: Array<Pick<ClientProfile, "id" | "brand_ids">> = readClients().clients
): SalesOrder[] {
  if (!session.isSalesOperator) return orders;
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  return orders.filter((order) => canAccessSalesOrder(session, order, clientsById));
}

/**
 * Merge a brand-scoped sales operator's client save into the full store.
 * Out-of-scope clients are preserved untouched; incoming rows must stay in brand scope.
 */
export function mergeClientsForSalesBrandScope(
  previous: ClientProfile[],
  incoming: ClientProfile[],
  allowedBrandIds: string[]
): { ok: true; clients: ClientProfile[] } | { ok: false; error: string } {
  const allowed = new Set(allowedBrandIds);
  const previousById = new Map(previous.map((client) => [client.id, client]));

  for (const client of incoming) {
    if (!client.brand_ids.some((id) => allowed.has(id))) {
      return {
        ok: false,
        error: `Client ${client.code || client.id} must include an allowed brand.`,
      };
    }
    const prior = previousById.get(client.id);
    for (const brandId of client.brand_ids) {
      if (allowed.has(brandId)) continue;
      if (prior?.brand_ids.includes(brandId)) continue;
      return {
        ok: false,
        error: `Brand "${brandId}" is outside your assigned sales brands.`,
      };
    }
  }

  const outOfScope = previous.filter((client) => !clientMatchesSalesBrandScope(client, allowedBrandIds));
  // Editor sends the full scoped list; omitted in-scope rows are deletions.
  return { ok: true, clients: [...outOfScope, ...incoming] };
}

export function assertClientBrandIdsAllowedForSales(
  session: Pick<SessionContext, "email" | "isSalesOperator">,
  brandIds: string[]
): string | null {
  const allowed = getAllowedSalesBrandIds(session);
  if (!allowed) return null;
  const allowedSet = new Set(allowed);
  const disallowed = brandIds.filter((id) => !allowedSet.has(id));
  if (disallowed.length > 0) {
    return `Brand "${disallowed[0]}" is outside your assigned sales brands.`;
  }
  if (brandIds.length === 0 || !brandIds.some((id) => allowedSet.has(id))) {
    return "Client must use one of your assigned sales brands.";
  }
  return null;
}
