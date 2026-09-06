import { PatternAlterationPendingPanelClient } from "@/components/pattern/PatternAlterationPendingPanelClient";
import { getSessionContext } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { listOutstandingPatternAlterationPending } from "@/lib/data/pattern-alteration-pending";
import { employeeDisplayNameById } from "@/lib/hr/payroll-lookup";
import { healMissingPatternAlterationPendingFromOpenSessions } from "@/lib/production/record-pattern-alteration-pending";

export async function PatternAlterationPendingPanel() {
  const session = await getSessionContext();
  if (!session.isAdmin && !session.isPatternOperator) {
    return null;
  }

  await ensureDocumentsLoaded([
    "pattern_alteration_pending",
    "sewing_sessions",
    "sales_orders",
    "payroll_employees",
  ]);
  try {
    await healMissingPatternAlterationPendingFromOpenSessions();
  } catch (error) {
    console.error("Failed to heal pattern alteration pending queue:", error);
  }
  // Always mount the client so an empty queue still polls while Pattern stays on the page.
  const items = listOutstandingPatternAlterationPending(40).map((item) => ({
    ...item,
    employee_name: employeeDisplayNameById(item.employee_id, item.employee_name) ?? item.employee_name,
  }));
  return <PatternAlterationPendingPanelClient initialItems={items} />;
}
