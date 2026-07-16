import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import { readSalesOrdersFresh, writeSalesOrders } from "@/lib/data/sales-orders";
import { settleFabricReceivingForSalesOrder } from "@/lib/production/fabric-receiving-settle";

function canSettleFabricReceiving(
  session: NonNullable<Awaited<ReturnType<typeof requireAuthenticated>>>
): boolean {
  return session.isAdmin || session.isClientManager;
}

export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!canSettleFabricReceiving(session)) {
    return NextResponse.json({ error: "Admin or QC access required." }, { status: 403 });
  }

  try {
    await ensureFabricReceivingDocumentsLoaded();
    const body = (await request.json()) as {
      sales_order_id?: string;
      mark_sales_order_complete?: boolean;
    };

    const salesOrderId = String(body.sales_order_id ?? "").trim();
    if (!salesOrderId) {
      return NextResponse.json({ error: "sales_order_id is required." }, { status: 400 });
    }

    const store = await readSalesOrdersFresh();
    const order = store.orders.find((item) => item.id === salesOrderId);
    if (!order) {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }

    const settle = await settleFabricReceivingForSalesOrder(salesOrderId, {
      so_number: order.so_number,
    });

    let sales_order_status = order.status;
    if (body.mark_sales_order_complete !== false && order.status !== "complete") {
      const orderIndex = store.orders.findIndex((item) => item.id === salesOrderId);
      if (orderIndex >= 0) {
        store.orders[orderIndex] = { ...store.orders[orderIndex]!, status: "complete" };
        await writeSalesOrders(store);
        sales_order_status = "complete";
      }
    }

    return NextResponse.json({ ...settle, sales_order_status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to settle fabric receiving.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
