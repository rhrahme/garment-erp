import { NextResponse } from "next/server";
import { canModifySalesOrders, requireAuthenticated } from "@/lib/auth/session";
import { markSalesOrderReadyMade } from "@/lib/sales-orders/mark-ready-made";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!canModifySalesOrders(session) || session.isSalesOperator) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      brand?: string | null;
      article?: string | null;
    } | null;

    const result = await markSalesOrderReadyMade({
      order_id: id,
      brand: body?.brand ?? "",
      article: body?.article,
      acted_by: (session.email ?? session.userId ?? "unknown").trim() || "unknown",
      source: "erp",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      order: result.order,
      cancelled_job_ids: result.cancelled_job_ids,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark ready-made.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
