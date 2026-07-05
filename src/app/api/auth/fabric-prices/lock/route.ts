import { NextResponse } from "next/server";
import { canRevealFabricPrices, FABRIC_PRICE_UNLOCK_COOKIE } from "@/lib/auth/fabric-price-access";
import { getSessionContext } from "@/lib/auth/session";

export async function POST() {
  const session = await getSessionContext();
  if (!canRevealFabricPrices(session)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(FABRIC_PRICE_UNLOCK_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
