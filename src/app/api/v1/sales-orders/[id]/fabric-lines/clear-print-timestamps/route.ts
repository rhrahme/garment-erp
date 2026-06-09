import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { clearSalesOrderFabricLinePrintTimestamps } from "@/lib/sales-orders/fabric-line-print";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { line_ids?: string[] };

    const result = await clearSalesOrderFabricLinePrintTimestamps(id, body.line_ids);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      order: result.order,
      cleared_line_ids: result.cleared_line_ids,
    });
  } catch (error) {
    console.error("Failed to clear fabric line print timestamps:", error);
    return NextResponse.json({ error: "Failed to clear print timestamps." }, { status: 500 });
  }
}
