import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternDocumentsLoaded, listPatternJobsForOrder } from "@/lib/data/pattern-jobs";
import { getSalesOrderById } from "@/lib/data/sales-orders";
import { redactSalesOrderFabricPrices } from "@/lib/auth/fabric-price-access";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";

export async function GET(_request: Request, context: { params: Promise<{ soId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }

    await ensurePatternDocumentsLoaded();
    await ensureDocumentsLoaded(["sales_orders"]);

    const { soId } = await context.params;
    const order = getSalesOrderById(soId);
    if (!order) {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }

    const jobs = listPatternJobsForOrder(soId);
    const safeOrder = session.canViewFabricListPrices ? order : redactSalesOrderFabricPrices(order);

    return NextResponse.json({
      order: safeOrder,
      jobs,
      awaiting_lines: order.fabric_lines.length === 0,
    });
  } catch (error) {
    console.error("Failed to load pattern order board:", error);
    return NextResponse.json({ error: "Failed to load pattern order." }, { status: 500 });
  }
}
