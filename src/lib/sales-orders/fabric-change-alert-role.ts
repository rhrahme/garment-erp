import type { SessionContext } from "@/lib/auth/session";
import type { FabricChangeAlertRole } from "@/lib/types/fabric-change-alerts";

/** Map session to the fabric-change acknowledgement role, if any. */
export function fabricChangeAlertRoleFromSession(
  session: Pick<
    SessionContext,
    | "isAdmin"
    | "isClientManager"
    | "isPatternOperator"
    | "isProductionOperator"
    | "isSalesOperator"
  >
): FabricChangeAlertRole | null {
  if (session.isAdmin) return "admin";
  if (session.isClientManager) return "qc";
  if (session.isPatternOperator) return "pattern";
  if (session.isProductionOperator) return "production";
  if (session.isSalesOperator) return "sales";
  return null;
}

export function canViewFabricChangeAlerts(
  session: Pick<
    SessionContext,
    | "isAdmin"
    | "isClientManager"
    | "isPatternOperator"
    | "isProductionOperator"
    | "isSalesOperator"
  >
): boolean {
  return fabricChangeAlertRoleFromSession(session) != null;
}
