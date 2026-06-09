import { NextResponse } from "next/server";
import { redactSalesOrderFabricPrices } from "@/lib/auth/fabric-price-access";
import { requireAuthenticated } from "@/lib/auth/session";
import { notifyIntegration } from "@/lib/integrations";
import { submitFabricOrderRequest } from "@/lib/sales-orders/submit-fabric-order-request";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await context.params;
    const result = await submitFabricOrderRequest(id, { requestedBy: session.email });

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
      requested_by: session.email,
    });

    const safeOrder = session.canViewFabricListPrices
      ? result.order
      : redactSalesOrderFabricPrices(result.order);

    return NextResponse.json({ order: safeOrder });
  } catch (error) {
    console.error("Failed to submit fabric order request:", error);
    return NextResponse.json({ error: "Failed to submit fabric order request." }, { status: 500 });
  }
}
