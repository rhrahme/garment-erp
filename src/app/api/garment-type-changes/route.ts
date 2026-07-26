import { NextResponse } from "next/server";
import {
  canViewPrices,
  redactFabricLinePrices,
  redactSalesOrderFabricPrices,
} from "@/lib/auth/fabric-price-access";
import { resolveFabricPriceAccess } from "@/lib/auth/fabric-price-access.server";
import { requireAuthenticated } from "@/lib/auth/session";
import { listGarmentTypeChanges } from "@/lib/data/garment-type-changes";
import { notifyAdminsOfGarmentTypeChange } from "@/lib/integrations/garment-type-change-alert";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { canAccessSalesOrder } from "@/lib/sales/access";
import {
  canChangeGarmentType,
  changeFabricLineGarmentType,
} from "@/lib/sales-orders/change-garment-type";
import { markGarmentTypeChangeAdminNotified } from "@/lib/sales-orders/garment-type-change-notify";

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!session.isAdmin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    await ensureDocumentsLoaded(["garment_type_changes"]);
    const limit = Math.min(
      200,
      Math.max(1, Number(new URL(request.url).searchParams.get("limit") ?? "50") || 50)
    );

    return NextResponse.json({ changes: listGarmentTypeChanges(limit) });
  } catch (error) {
    console.error("Failed to list garment type changes:", error);
    return NextResponse.json({ error: "Failed to load garment type history." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!canChangeGarmentType(session)) {
      return NextResponse.json(
        { error: "Only Admin, QC, Pattern, and Factory Manager can change garment types." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as {
      sales_order_id?: string;
      line_id?: string;
      garment_type?: string;
      note?: string | null;
    };

    const salesOrderId = body.sales_order_id?.trim() ?? "";
    if (!salesOrderId) {
      return NextResponse.json({ error: "sales_order_id is required." }, { status: 400 });
    }

    await ensureDocumentsLoaded(["clients", "sales_orders"]);
    const order = await getSalesOrderByIdFresh(salesOrderId);
    if (!order || !canAccessSalesOrder(session, order)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const result = await changeFabricLineGarmentType(
      {
        sales_order_id: salesOrderId,
        line_id: body.line_id ?? "",
        garment_type: body.garment_type ?? "",
        note: body.note,
      },
      { changedBy: session.email ?? "unknown" }
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const emailed = await notifyAdminsOfGarmentTypeChange(result.result.change);
    if (emailed) {
      await markGarmentTypeChangeAdminNotified(result.result.change.id);
    }

    const canViewFabricPrices = await resolveFabricPriceAccess(session);
    const safeOrder = canViewFabricPrices
      ? result.result.order
      : redactSalesOrderFabricPrices(result.result.order);
    const safeLine = canViewFabricPrices
      ? result.result.updated_line
      : redactFabricLinePrices(result.result.updated_line);

    return NextResponse.json({
      change: result.result.change,
      order: safeOrder,
      updated_line: safeLine,
      admin_notified: emailed,
    });
  } catch (error) {
    console.error("Failed to change garment type:", error);
    return NextResponse.json({ error: "Failed to change garment type." }, { status: 500 });
  }
}
