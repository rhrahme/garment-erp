import { PatternAlterationPendingPanelClient } from "@/components/pattern/PatternAlterationPendingPanelClient";
import { getSessionContext } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { listOutstandingPatternAlterationPending } from "@/lib/data/pattern-alteration-pending";
import { healMissingPatternAlterationPendingFromOpenSessions } from "@/lib/production/record-pattern-alteration-pending";

export async function PatternAlterationPendingPanel() {
  const session = await getSessionContext();
  if (!session.isAdmin && !session.isPatternOperator) {
    return null;
  }

  await ensureDocumentsLoaded(["pattern_alteration_pending", "sewing_sessions", "sales_orders"]);
  try {
    await healMissingPatternAlterationPendingFromOpenSessions();
  } catch (error) {
    console.error("Failed to heal pattern alteration pending queue:", error);
  }
  // Always mount the client so an empty queue still polls while Pattern stays on the page.
  const items = listOutstandingPatternAlterationPending(40);
  return <PatternAlterationPendingPanelClient initialItems={items} />;
}
