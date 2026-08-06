import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { listOutstandingPatternAlterationPending } from "@/lib/data/pattern-alteration-pending";
import { healMissingPatternAlterationPendingFromOpenSessions } from "@/lib/production/record-pattern-alteration-pending";

export async function GET() {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!session.isAdmin && !session.isPatternOperator) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await ensureDocumentsLoaded(["pattern_alteration_pending", "sewing_sessions", "sales_orders"]);
  try {
    await healMissingPatternAlterationPendingFromOpenSessions();
  } catch (error) {
    console.error("Failed to heal pattern alteration pending on list:", error);
  }
  const items = listOutstandingPatternAlterationPending(100);
  return NextResponse.json({ items });
}
