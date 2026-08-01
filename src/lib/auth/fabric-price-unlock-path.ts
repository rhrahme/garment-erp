/** Path-scoped fabric price unlock helpers (client + server safe). */

/** Normalize a UI path for unlock cookie matching (no query/hash). */
export function normalizePriceUnlockPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const trimmed = pathname.trim();
  if (!trimmed.startsWith("/")) return null;
  const path = trimmed.split("?")[0]?.split("#")[0] ?? "";
  if (!path.startsWith("/") || path.includes("://") || path.includes("\n")) return null;
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

/** Cookie value for an unlock that is valid only on this pathname. */
export function encodeFabricPriceUnlockCookie(pathname: string): string | null {
  const path = normalizePriceUnlockPath(pathname);
  if (!path) return null;
  return `1:${path}`;
}

/** Path encoded in an unlock cookie, or null if missing/legacy/invalid. */
export function parseFabricPriceUnlockPath(cookie: string | null | undefined): string | null {
  if (!cookie || !cookie.startsWith("1:")) return null;
  return normalizePriceUnlockPath(cookie.slice(2));
}

/** True when unlock cookie is scoped to the page currently being rendered/fetched. */
export function fabricPriceUnlockMatchesPath(
  cookie: string | null | undefined,
  currentPathname: string | null | undefined
): boolean {
  const unlockedPath = parseFabricPriceUnlockPath(cookie);
  const current = normalizePriceUnlockPath(currentPathname);
  if (!unlockedPath || !current) return false;
  return unlockedPath === current;
}
