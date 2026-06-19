/**
 * Sales orders intentionally removed from sales-orders.json — map id or SO number
 * to where users should land instead (avoids 404 from stale bookmarks/links).
 */
const REMOVED_SALES_ORDER_REDIRECTS: Record<string, string> = {
  // Moussa duplicate orders consolidated into SO-2026-0109.
  "so-moussa-stylbiella-handwritten": "/orders/so-1781828734583",
  "so-1781821780944": "/orders/so-1781828734583",
  "SO-2026-0107": "/orders/so-1781828734583",
  "so-1781826697158": "/orders/so-1781828734583",
  "SO-2026-0108": "/orders/so-1781828734583",
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
