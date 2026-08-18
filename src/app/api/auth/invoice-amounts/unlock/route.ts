import { NextResponse } from "next/server";
import { canViewMoney, isInvoiceAmountsPasswordValid } from "@/lib/auth/invoice-amounts-access";
import { requireAuthenticated } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session || !canViewMoney(session)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

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
