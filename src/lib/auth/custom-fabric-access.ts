import type { SessionContext } from "@/lib/auth/session";

type CustomFabricCreateSession = Pick<
  SessionContext,
  | "isSalesOperator"
  | "isAdmin"
  | "isClientManager"
  | "isTaskOperator"
  | "isProductionOperator"
  | "isPatternOperator"
>;

/**
 * Who may create custom / one-off fabrics (CF-YYYY-####).
 * Sales may browse Fabric Spec but must not add new custom fabrics.
 * Admin, QC (client manager), task, production, and pattern stay allowed.
 */
export function canCreateCustomFabric(session: CustomFabricCreateSession): boolean {
  if (session.isSalesOperator) return false;
  return (
    session.isAdmin ||
    session.isClientManager ||
    session.isTaskOperator ||
    session.isProductionOperator ||
    session.isPatternOperator
  );
}
