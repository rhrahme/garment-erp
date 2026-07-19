import type { SessionContext } from "@/lib/auth/session";
import { filterClientsByBrand } from "@/lib/clients/filter";
import type { ClientProfile } from "@/lib/types/clients";
import type { SalesOrder } from "@/lib/types/sales-orders";

export function canAccessSalesOrder(session: SessionContext, order: SalesOrder): boolean {
  if (!session.isSalesOperator) return true;
  const owner = order.sales_owner_email?.trim().toLowerCase();
  return Boolean(owner && owner === session.email?.trim().toLowerCase());
}

export function filterSalesOrdersForSession(
  session: SessionContext,
  orders: SalesOrder[]
): SalesOrder[] {
  return session.isSalesOperator
    ? orders.filter((order) => canAccessSalesOrder(session, order))
    : orders;
}

/**
 * Brands this sales user is allowed to work with.
 * `null` = all brands (current behavior — no per-user brand assignment yet).
 * When assignments exist, return the allow-list and pass it into
 * {@link filterClientsForSalesBrandScope} / FactoryBrandTabs `brands`.
 */
export function getAllowedSalesBrandIds(
  _session: Pick<SessionContext, "email" | "isSalesOperator">
): string[] | null {
  return null;
}

/** Apply future sales-user → brand scoping; no-op while allow-list is null. */
export function filterClientsForSalesBrandScope(
  clients: ClientProfile[],
  allowedBrandIds: string[] | null
): ClientProfile[] {
  if (!allowedBrandIds) return clients;
  const allowed = new Set(allowedBrandIds);
  return clients.filter(
    (client) =>
      client.brand_ids.length === 0 || client.brand_ids.some((id) => allowed.has(id))
  );
}

/** UI brand tab filter on top of optional sales brand scoping. */
export function filterSalesClientsByBrand(
  clients: ClientProfile[],
  brandFilter: string | null,
  allowedBrandIds: string[] | null = null
): ClientProfile[] {
  return filterClientsByBrand(filterClientsForSalesBrandScope(clients, allowedBrandIds), brandFilter);
}
