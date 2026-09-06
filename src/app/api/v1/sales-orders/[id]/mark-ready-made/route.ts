import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { markSalesOrderReadyMade } from "@/lib/sales-orders/mark-ready-made";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      brand?: string | null;
      article?: string | null;
      actor?: string | null;
    } | null;

    const result = await markSalesOrderReadyMade({
      order_id: id,
      brand: body?.brand ?? "",
      article: body?.article,
      acted_by:
        typeof body?.actor === "string" && body.actor.trim() ? body.actor.trim() : "api",
      source: "api",
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
