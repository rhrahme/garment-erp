import { NextResponse } from "next/server";
import { FABRIC_PRICE_UNLOCK_COOKIE } from "@/lib/auth/fabric-price-access";

export async function POST() {
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
