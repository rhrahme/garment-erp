/**
 * Sales orders intentionally removed from sales-orders.json — map id or SO number
 * to where users should land instead (avoids 404 from stale bookmarks/links).
 */
const REMOVED_SALES_ORDER_REDIRECTS: Record<string, string> = {
  // Moussa Stylbiella handwritten order — lives in fabric order draft, not a submitted SO.
  "so-moussa-stylbiella-handwritten": "/fabric-orders/new?continue=1",
  "SO-2026-0107": "/fabric-orders/new?continue=1",
};

const REMOVED_ORDER_PATH = /^\/(?:orders|fabric-orders|pattern\/orders)\/([^/]+)/;

export function getRemovedSalesOrderRedirectForKey(orderKey: string): string | null {
  return REMOVED_SALES_ORDER_REDIRECTS[orderKey] ?? null;
}

export function getRemovedSalesOrderRedirect(pathname: string): string | null {
  const match = pathname.match(REMOVED_ORDER_PATH);
  if (!match) return null;
  return getRemovedSalesOrderRedirectForKey(match[1]!);
}
