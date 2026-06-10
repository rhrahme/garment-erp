import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { prepareFabricPosBatch } from "@/lib/sales-orders/prepare-fabric-pos-batch";

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json().catch(() => ({}))) as { orderIds?: string[] };
    const result = await prepareFabricPosBatch({
      orderIds: Array.isArray(body.orderIds) ? body.orderIds : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to prepare supplier emails (API):", error);
    return NextResponse.json({ error: "Failed to prepare supplier emails." }, { status: 500 });
  }
}
