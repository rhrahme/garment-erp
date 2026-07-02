import { NextResponse } from "next/server";
import { notifyIntegration } from "@/lib/integrations";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { submitFabricOrderRequest } from "@/lib/sales-orders/submit-fabric-order-request";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { requested_by?: string };
    const result = await submitFabricOrderRequest(id, {
      requestedBy: body.requested_by?.trim() || "api",
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await notifyIntegration("sales_order.fabric_order_requested", {
      order_id: result.order.id,
      so_number: result.order.so_number,
      client_code: result.order.client_code,
      client_name: result.order.client_name,
      fabric_line_count: result.order.fabric_lines.length,
      delivery_destination: result.order.delivery_destination,
      requested_by: body.requested_by?.trim() || "api",
      requested_at: result.order.fabric_order_requested_at,
      source: "api",
    });

    return NextResponse.json({ order: result.order });
  } catch (error) {
    console.error("Failed to submit fabric order request (API):", error);
    return NextResponse.json({ error: "Failed to submit fabric order request." }, { status: 500 });
  }
}
