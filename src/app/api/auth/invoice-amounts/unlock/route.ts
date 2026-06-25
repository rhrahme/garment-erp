import { NextResponse } from "next/server";
import { isInvoiceAmountsPasswordValid } from "@/lib/auth/invoice-amounts-access";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password?: string };
    const password = body.password?.trim() ?? "";

    if (!isInvoiceAmountsPasswordValid(password)) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 403 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Invoice amounts unlock failed:", error);
    return NextResponse.json({ error: "Failed to verify password." }, { status: 500 });
  }
}
