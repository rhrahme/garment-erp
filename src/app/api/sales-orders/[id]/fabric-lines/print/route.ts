import { NextResponse } from "next/server";
import { redactSalesOrderFabricPrices } from "@/lib/auth/fabric-price-access";
import { resolveFabricPriceAccess } from "@/lib/auth/fabric-price-access.server";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  isFabricLinePrintKind,
  markSalesOrderFabricLinesPrinted,
} from "@/lib/sales-orders/fabric-line-print";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as { kind?: unknown; line_ids?: string[] };
    const kind = body.kind;

    if (!isFabricLinePrintKind(kind)) {
      return NextResponse.json({ error: "Invalid print kind." }, { status: 400 });
    }

    const result = await markSalesOrderFabricLinesPrinted(id, kind, body.line_ids);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const canViewFabricPrices = await resolveFabricPriceAccess(session);
    const safeOrder = canViewFabricPrices
      ? result.order
      : redactSalesOrderFabricPrices(result.order);

    return NextResponse.json({
      order: safeOrder,
      marked_line_ids: result.marked_line_ids,
      kind,
    });
  } catch (error) {
    console.error("Failed to mark fabric lines printed:", error);
    return NextResponse.json({ error: "Failed to mark fabric lines printed." }, { status: 500 });
  }
}
