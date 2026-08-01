import { NextResponse } from "next/server";
import {
  canRevealFabricPrices,
  encodeFabricPriceUnlockCookie,
  FABRIC_PRICE_UNLOCK_COOKIE,
  FABRIC_PRICE_UNLOCK_MAX_AGE_SEC,
  isFabricPriceAccessCodeValid,
  isFabricPriceUnlockConfigured,
} from "@/lib/auth/fabric-price-access";
import { getSessionContext } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!canRevealFabricPrices(session)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    if (!isFabricPriceUnlockConfigured()) {
      return NextResponse.json(
        {
          error:
            "Fabric price unlock is not configured on the server. In Vercel → Settings → Environment Variables, add FABRIC_PRICE_ACCESS_CODES=1122 (or reuse INVOICE_AMOUNTS_PASSWORD), then redeploy.",
        },
        { status: 503 }
      );
    }

    const body = (await request.json()) as {
      code?: string;
      password?: string;
      pathname?: string;
    };
    const code = (body.password ?? body.code)?.trim() ?? "";
    const unlockCookie = encodeFabricPriceUnlockCookie(body.pathname ?? "");

    if (!isFabricPriceAccessCodeValid(code)) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 403 });
    }
    if (!unlockCookie) {
      return NextResponse.json({ error: "Missing page path for unlock." }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(FABRIC_PRICE_UNLOCK_COOKIE, unlockCookie, {
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
