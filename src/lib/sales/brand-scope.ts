import type { SessionContext } from "@/lib/auth/session";
import { filterClientsByBrand } from "@/lib/clients/filter";
import type { ClientProfile } from "@/lib/types/clients";

/**
 * Env map: `SALES_BRAND_SCOPE=sales1@hagan.pro:gliani,sales2@x.com:fouad|fouad-rahme`
 * - Entries comma-separated
 * - Each entry `email:brand` or `email:brand1|brand2`
 * - Sales emails omitted from the map keep all-brand access (null allow-list)
 *
 * Client-safe (no Node `fs` / document store imports).
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
