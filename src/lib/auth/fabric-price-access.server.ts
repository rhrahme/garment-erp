import { cookies } from "next/headers";
import {
  FABRIC_PRICE_UNLOCK_COOKIE,
  hasFabricPriceAccess,
} from "@/lib/auth/fabric-price-access";
import type { SessionContext } from "@/lib/auth/session";

export async function resolveFabricPriceAccess(session: SessionContext): Promise<boolean> {
  const cookieStore = await cookies();
  return hasFabricPriceAccess(session, cookieStore.get(FABRIC_PRICE_UNLOCK_COOKIE)?.value);
}
