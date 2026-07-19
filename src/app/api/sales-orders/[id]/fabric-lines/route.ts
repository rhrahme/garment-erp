import { NextResponse } from "next/server";
import {
  canViewPrices,
  redactFabricLinePrices,
  redactSalesOrderFabricPrices,
} from "@/lib/auth/fabric-price-access";
import { resolveFabricPriceAccess } from "@/lib/auth/fabric-price-access.server";
import { requireAuthenticated, canModifySalesOrders } from "@/lib/auth/session";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { notifyIntegration } from "@/lib/integrations";
import { syncPatternJobsFromSalesOrder } from "@/lib/pattern/sync-from-sales-order";
import {
  guardLineRemovalPatternSync,
  syncPatternAfterLineRemoval,
} from "@/lib/pattern/sync-guard";
import {
  appendSalesOrderFabricLines,
  deleteSalesOrderFabricLine,
  updateSalesOrderFabricLine,
  type FabricLineInput,
  type FabricLineUpdateInput,
} from "@/lib/sales-orders/fabric-lines";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!canModifySalesOrders(session)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as { fabric_lines?: FabricLineInput[] };
    const inputs = body.fabric_lines ?? [];

    const result = await appendSalesOrderFabricLines(id, inputs, { addedBy: session.email });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await notifyIntegration("sales_order.fabric_lines_added", {
      order_id: result.order.id,
      so_number: result.order.so_number,
      added_line_ids: result.added_lines.map((line) => line.id),
      added_count: result.added_lines.length,
      added_by: session.email,
    });

    await syncPatternJobsFromSalesOrder(result.order);

    const canViewFabricPrices = await resolveFabricPriceAccess(session);
    const safeOrder = canViewFabricPrices
      ? result.order
      : redactSalesOrderFabricPrices(result.order);

    return NextResponse.json({ order: safeOrder, added_lines: result.added_lines.length }, { status: 200 });
  } catch (error) {
    console.error("Failed to append fabric lines:", error);
    return NextResponse.json({ error: "Failed to add fabric lines." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!canModifySalesOrders(session)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as FabricLineUpdateInput;
    const result = await updateSalesOrderFabricLine(id, body, {
      updatedBy: session.email,
      allowPriceEdit: canViewPrices(session),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await notifyIntegration("sales_order.fabric_lines_updated", {
      order_id: result.order.id,
      so_number: result.order.so_number,
      line_id: result.updated_line.id,
      updated_by: session.email,
    });

    await syncPatternJobsFromSalesOrder(result.order);

    const canViewFabricPrices = await resolveFabricPriceAccess(session);
    const safeOrder = canViewFabricPrices
      ? result.order
      : redactSalesOrderFabricPrices(result.order);

    const safeUpdatedLine = canViewFabricPrices
      ? result.updated_line
      : redactFabricLinePrices(result.updated_line);
    return NextResponse.json({ order: safeOrder, updated_line: safeUpdatedLine });
  } catch (error) {
    console.error("Failed to update fabric line:", error);
    return NextResponse.json({ error: "Failed to update fabric line." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!canModifySalesOrders(session)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as {
      line_id?: string;
      force_cancel_orphan_jobs?: boolean;
    };
    const lineId = body.line_id?.trim() ?? "";
    if (!lineId) {
      return NextResponse.json({ error: "line_id is required." }, { status: 400 });
    }

    const forceCancel = body.force_cancel_orphan_jobs === true;
    const orderBefore = await getSalesOrderByIdFresh(id);
    if (!orderBefore) {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }

    const guard = guardLineRemovalPatternSync(orderBefore, lineId, forceCancel);
    if (!guard.ok) {
      return NextResponse.json(guard.body, { status: guard.status });
    }

    const result = await deleteSalesOrderFabricLine(id, lineId, { removedBy: session.email });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await syncPatternAfterLineRemoval(result.order, forceCancel || guard.pendingCount > 0);

    await notifyIntegration("sales_order.fabric_lines_removed", {
      order_id: result.order.id,
      so_number: result.order.so_number,
      line_id: result.removed_line.id,
      removed_by: session.email,
    });

    const canViewFabricPrices = await resolveFabricPriceAccess(session);
    const safeOrder = canViewFabricPrices
      ? result.order
      : redactSalesOrderFabricPrices(result.order);

    return NextResponse.json({ order: safeOrder, removed_line_id: result.removed_line.id });
  } catch (error) {
    console.error("Failed to delete fabric line:", error);
    return NextResponse.json({ error: "Failed to remove fabric line." }, { status: 500 });
  }
}
