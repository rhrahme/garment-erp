import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { ensureFabricOrdersLoaded, listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";

export async function GET(request: Request) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    await ensureFabricOrdersLoaded();
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
