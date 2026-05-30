import { NextResponse } from "next/server";
import { listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";

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
