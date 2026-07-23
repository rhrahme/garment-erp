import type { SessionContext } from "@/lib/auth/session";
import { getBrandClientCodePrefix } from "@/lib/clients/codes";
import { getClientById, readClients } from "@/lib/data/clients";
import type { ClientProfile } from "@/lib/types/clients";
import type { SalesOrder } from "@/lib/types/sales-orders";
import {
  clientMatchesSalesBrandScope,
  filterClientsForSalesBrandScope,
  filterSalesClientsByBrand,
  getAllowedSalesBrandIds,
  parseSalesBrandScope,
} from "@/lib/sales/brand-scope";

export {
  clientMatchesSalesBrandScope,
  filterClientsForSalesBrandScope,
  filterSalesClientsByBrand,
  getAllowedSalesBrandIds,
  parseSalesBrandScope,
};

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
