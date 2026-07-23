import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  FABRIC_PRICE_UNLOCK_COOKIE,
  hasFabricPriceAccess,
  redactSalesOrderFabricPrices,
} from "@/lib/auth/fabric-price-access";
import { getSessionContext, requireAdmin, requireAuthenticated, canModifySalesOrders } from "@/lib/auth/session";
import {
  deleteSalesOrderById,
  getSalesOrderById,
  readSalesOrdersFresh,
  writeSalesOrders,
} from "@/lib/data/sales-orders";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { notifyIntegration } from "@/lib/integrations";
import { isDeliveryDestination } from "@/lib/shipping/delivery-destinations";
import { canAccessSalesOrder } from "@/lib/sales/access";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!session.userId && !session.email) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await ensureDocumentsLoaded(["clients", "sales_orders"]);

    const { id } = await context.params;
    const order = getSalesOrderById(id);
    if (!order) {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }
    if (!canAccessSalesOrder(session, order)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const cookieStore = await cookies();
    const canViewFabricPrices = hasFabricPriceAccess(
      session,
      cookieStore.get(FABRIC_PRICE_UNLOCK_COOKIE)?.value
    );
    const safeOrder = canViewFabricPrices ? order : redactSalesOrderFabricPrices(order);
    return NextResponse.json({ order: safeOrder });
  } catch (error) {
    console.error("Failed to read sales order:", error);
    return NextResponse.json({ error: "Failed to load sales order." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await ensureDocumentsLoaded(["clients", "sales_orders"]);

    if (!canModifySalesOrders(session)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as { delivery_destination?: string | null };

    if (body.delivery_destination == null) {
      return NextResponse.json({ error: "delivery_destination is required." }, { status: 400 });
    }

    const destination = String(body.delivery_destination).trim();
    if (!isDeliveryDestination(destination)) {
      return NextResponse.json({ error: "Invalid delivery destination." }, { status: 400 });
    }

    const store = await readSalesOrdersFresh();
    const index = store.orders.findIndex((order) => order.id === id);
    if (index < 0) {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }
    if (!canAccessSalesOrder(session, store.orders[index]!)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    store.orders[index] = {
      ...store.orders[index]!,
      delivery_destination: destination,
    };
    const saved = await writeSalesOrders(store);
    const order = saved.orders.find((item) => item.id === id);
    const cookieStore = await cookies();
    const canViewFabricPrices = hasFabricPriceAccess(
      session,
      cookieStore.get(FABRIC_PRICE_UNLOCK_COOKIE)?.value
    );
    const safeOrder = canViewFabricPrices && order
      ? order
      : order
        ? redactSalesOrderFabricPrices(order)
        : undefined;

    return NextResponse.json({ order: safeOrder });
  } catch (error) {
    console.error("Failed to update sales order:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update sales order.";
    const status = message.includes("Supabase") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json(
        { error: "Admin access required to delete sales orders." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const result = await deleteSalesOrderById(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await notifyIntegration("sales_order.deleted", {
      id: result.order.id,
      so_number: result.order.so_number,
      client_code: result.order.client_code,
      deleted_by: session.email,
    });

    return NextResponse.json({ ok: true, order_id: result.order.id });
  } catch (error) {
    console.error("Failed to delete sales order:", error);
    return NextResponse.json({ error: "Failed to delete sales order." }, { status: 500 });
  }
}
