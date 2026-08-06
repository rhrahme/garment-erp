import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import {
  acknowledgePatternAlterationPending,
  markPatternAlterationChartUpdated,
} from "@/lib/pattern/pattern-alteration-pending-actions";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      action?: string;
      by?: string;
    };
    const by = body.by?.trim() || "api";

    if (body.action === "acknowledge") {
      const result = await acknowledgePatternAlterationPending(id, by, "api");
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ item: result.item, source: "api" });
    }

    if (body.action === "chart_updated") {
      const result = await markPatternAlterationChartUpdated(id, by, "api");
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ item: result.item, source: "api" });
    }

    return NextResponse.json(
      { error: 'action must be "acknowledge" or "chart_updated".' },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to update pattern alteration pending (API):", error);
    return NextResponse.json({ error: "Failed to update pending alteration." }, { status: 500 });
  }
}
