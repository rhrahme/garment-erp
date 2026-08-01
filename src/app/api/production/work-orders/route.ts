import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readProductionWorkOrders } from "@/lib/data/production-work-orders";

export async function GET() {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await ensureDocumentsLoaded(["production_work_orders"]);
    return NextResponse.json(readProductionWorkOrders());
  } catch (error) {
    console.error("Failed to read production work orders:", error);
    return NextResponse.json({ error: "Failed to load production work orders." }, { status: 500 });
  }
}
