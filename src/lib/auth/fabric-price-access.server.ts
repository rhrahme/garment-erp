import { cookies, headers } from "next/headers";
import {
  FABRIC_PRICE_UNLOCK_COOKIE,
  hasFabricPriceAccess,
  normalizePriceUnlockPath,
} from "@/lib/auth/fabric-price-access";
import type { SessionContext } from "@/lib/auth/session";

function pathnameFromReferer(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return normalizePriceUnlockPath(new URL(referer).pathname);
  } catch {
    return null;
  }
}

/**
 * Resolve whether prices may be returned for this request.
 * Prefer an explicit page pathname; otherwise use the Referer path so API
 * responses stay locked after navigating away from the unlocked page.
 */
export async function resolveFabricPriceAccess(
  session: SessionContext,
  pathname?: string | null
): Promise<boolean> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(FABRIC_PRICE_UNLOCK_COOKIE)?.value;
  if (pathname) {
    return hasFabricPriceAccess(session, cookie, pathname);
  }
  const headerStore = await headers();
  const fromReferer = pathnameFromReferer(headerStore.get("referer"));
  return hasFabricPriceAccess(session, cookie, fromReferer);
}
