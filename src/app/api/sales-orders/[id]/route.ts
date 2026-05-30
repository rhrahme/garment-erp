import { NextResponse } from "next/server";
import { getSalesOrderById, readSalesOrders, writeSalesOrders } from "@/lib/data/sales-orders";
import { isDeliveryDestination } from "@/lib/shipping/delivery-destinations";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const order = getSalesOrderById(id);
    if (!order) {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (error) {
    console.error("Failed to read sales order:", error);
    return NextResponse.json({ error: "Failed to load sales order." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { delivery_destination?: string | null };

    if (body.delivery_destination == null) {
      return NextResponse.json({ error: "delivery_destination is required." }, { status: 400 });
    }

    const destination = String(body.delivery_destination).trim();
    if (!isDeliveryDestination(destination)) {
      return NextResponse.json({ error: "Invalid delivery destination." }, { status: 400 });
    }

    const store = readSalesOrders();
    const index = store.orders.findIndex((order) => order.id === id);
    if (index < 0) {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }

    store.orders[index] = {
      ...store.orders[index]!,
      delivery_destination: destination,
    };
    const saved = writeSalesOrders(store);
    const order = saved.orders.find((item) => item.id === id);

    return NextResponse.json({ order });
  } catch (error) {
    console.error("Failed to update sales order:", error);
    return NextResponse.json({ error: "Failed to update sales order." }, { status: 500 });
  }
}
