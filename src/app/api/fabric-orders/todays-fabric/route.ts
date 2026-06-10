import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getTodaysFabricSummary } from "@/lib/sales-orders/todays-fabric";

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const summary = await getTodaysFabricSummary();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Failed to load today's fabric summary:", error);
    return NextResponse.json({ error: "Failed to load today's fabric orders." }, { status: 500 });
  }
}
