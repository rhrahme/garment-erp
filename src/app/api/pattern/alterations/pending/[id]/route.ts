import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  acknowledgePatternAlterationPending,
  markPatternAlterationChartUpdated,
} from "@/lib/pattern/pattern-alteration-pending-actions";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!session.isAdmin && !session.isPatternOperator) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as { action?: string };
    const by = session.email ?? "unknown";

    if (body.action === "acknowledge") {
      const result = await acknowledgePatternAlterationPending(id, by);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ item: result.item });
    }

    if (body.action === "chart_updated") {
      const result = await markPatternAlterationChartUpdated(id, by);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ item: result.item });
    }

    return NextResponse.json(
      { error: 'action must be "acknowledge" or "chart_updated".' },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to update pattern alteration pending:", error);
    return NextResponse.json({ error: "Failed to update pending alteration." }, { status: 500 });
  }
}
