import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prepareFabricPosBatch } from "@/lib/sales-orders/prepare-fabric-pos-batch";

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { orderIds?: string[] };
    const result = await prepareFabricPosBatch({
      orderIds: Array.isArray(body.orderIds) ? body.orderIds : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to prepare supplier emails:", error);
    return NextResponse.json({ error: "Failed to prepare supplier emails." }, { status: 500 });
  }
}
