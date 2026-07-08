import { NextResponse } from "next/server";
import { redactSalesOrderFabricPrices } from "@/lib/auth/fabric-price-access";
import { resolveFabricPriceAccess } from "@/lib/auth/fabric-price-access.server";
import { requireAuthenticated } from "@/lib/auth/session";
import { clearSalesOrderFabricLinePrintTimestamps } from "@/lib/sales-orders/fabric-line-print";

function canClearPrintTimestamps(session: NonNullable<Awaited<ReturnType<typeof requireAuthenticated>>>): boolean {
  return session.isAdmin || session.isClientManager || session.isTaskOperator;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!canClearPrintTimestamps(session)) {
      return NextResponse.json({ error: "Admin or QC access required." }, { status: 403 });
    }

    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { line_ids?: string[] };

    const result = await clearSalesOrderFabricLinePrintTimestamps(id, body.line_ids);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const canViewFabricPrices = await resolveFabricPriceAccess(session);
    const safeOrder = canViewFabricPrices
      ? result.order
      : redactSalesOrderFabricPrices(result.order);

    return NextResponse.json({
      order: safeOrder,
      cleared_line_ids: result.cleared_line_ids,
    });
  } catch (error) {
    console.error("Failed to clear fabric line print timestamps:", error);
    return NextResponse.json({ error: "Failed to clear print timestamps." }, { status: 500 });
  }
}
