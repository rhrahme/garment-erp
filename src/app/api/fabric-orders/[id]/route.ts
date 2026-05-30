import { NextResponse } from "next/server";
import { listStoredFabricOrders, getStoredFabricOrder, markStoredFabricOrderSent } from "@/lib/integrations/fabric-order-store";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const salesOrderId = url.searchParams.get("sales_order_id");
    let orders = listStoredFabricOrders();
    if (salesOrderId) {
      orders = orders.filter((order) => order.sales_order_id === salesOrderId);
    }
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Failed to list fabric orders:", error);
    return NextResponse.json({ error: "Failed to load fabric orders." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { emailed_at?: string; email_to?: string };
    const order = getStoredFabricOrder(id);
    if (!order) {
      return NextResponse.json({ error: "Fabric order not found." }, { status: 404 });
    }

    const updated = markStoredFabricOrderSent(id, {
      emailed_at: body.emailed_at ?? new Date().toISOString(),
      email_to: body.email_to ?? order.supplier?.email ?? "",
      status: "sent",
    });

    return NextResponse.json({ order: updated });
  } catch (error) {
    console.error("Failed to update fabric order:", error);
    return NextResponse.json({ error: "Failed to update fabric order." }, { status: 500 });
  }
}
