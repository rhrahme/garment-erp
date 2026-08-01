import { type NextRequest } from "next/server";
import { FABRIC_PRICE_UNLOCK_COOKIE } from "@/lib/auth/fabric-price.constants";
import { shouldClearFabricPriceUnlockOnRequest } from "@/lib/auth/fabric-price-unlock-request";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Full page load / refresh / login: always start with prices locked.
  // Soft navigations are re-locked via path-scoped cookies + PriceRevealLockOnNavigate.
  const clearUnlock = shouldClearFabricPriceUnlockOnRequest(request.headers);
  if (clearUnlock) {
    request.cookies.delete(FABRIC_PRICE_UNLOCK_COOKIE);
  }

  const response = await updateSession(request);

  if (clearUnlock) {
    response.cookies.set(FABRIC_PRICE_UNLOCK_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|drapers-swatch-preview\\.html|factory/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|pdf)$).*)",
  ],
};
