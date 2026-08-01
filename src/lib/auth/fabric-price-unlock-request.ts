/**
 * Full browser load / refresh / login redirect (typed URL).
 * Soft App Router navigations are re-locked via path-scoped cookies and
 * PriceRevealLockOnNavigate instead of this header check.
 */
export function shouldClearFabricPriceUnlockOnRequest(headers: Headers): boolean {
  return headers.get("sec-fetch-dest") === "document";
}
