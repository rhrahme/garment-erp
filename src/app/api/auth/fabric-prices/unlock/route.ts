import { NextResponse } from "next/server";
import {
  canRevealFabricPrices,
  FABRIC_PRICE_UNLOCK_COOKIE,
  FABRIC_PRICE_UNLOCK_MAX_AGE_SEC,
  isFabricPriceAccessCodeValid,
} from "@/lib/auth/fabric-price-access";
import { getSessionContext } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!canRevealFabricPrices(session)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    const body = (await request.json()) as { code?: string; password?: string };
    const code = (body.password ?? body.code)?.trim() ?? "";

    if (!isFabricPriceAccessCodeValid(code)) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 403 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(FABRIC_PRICE_UNLOCK_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: FABRIC_PRICE_UNLOCK_MAX_AGE_SEC,
    });
    return response;
  } catch (error) {
    console.error("Fabric price unlock failed:", error);
    return NextResponse.json({ error: "Failed to verify password." }, { status: 500 });
  }
}
