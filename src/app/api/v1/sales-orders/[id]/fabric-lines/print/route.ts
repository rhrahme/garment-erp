import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import {
  isFabricLinePrintKind,
  markSalesOrderFabricLinesPrinted,
} from "@/lib/sales-orders/fabric-line-print";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
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

    return NextResponse.json({
      order: result.order,
      marked_line_ids: result.marked_line_ids,
      kind,
    });
  } catch (error) {
    console.error("Failed to mark fabric lines printed:", error);
    return NextResponse.json({ error: "Failed to mark fabric lines printed." }, { status: 500 });
  }
}
