import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { cancelFabricOrders } from "@/lib/sales-orders/cancel-fabric-pos";

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as { ids?: string[] };
    const result = await cancelFabricOrders(body.ids ?? []);

    return NextResponse.json({
      ok: true,
      orders: result.cancelled,
      count: result.cancelled.length,
      sales_order_ids: result.sales_order_ids,
    });
  } catch (error) {
    console.error("Failed to cancel fabric orders:", error);
    const message = error instanceof Error ? error.message : "Failed to cancel fabric orders.";
    const status = message.includes("not found") || message.includes("No pending") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
