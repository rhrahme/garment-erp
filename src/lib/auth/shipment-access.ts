import type { SessionContext } from "@/lib/auth/session";

/** Admin, factory manager, or accounting — read AWB tracking lists and lookup. */
export function canViewShipments(
  session: Pick<SessionContext, "isAdmin" | "isProductionOperator" | "isAccountingOperator">
): boolean {
  return session.isAdmin || session.isProductionOperator || session.isAccountingOperator;
}

/** Admin or factory manager — add AWBs, sync carrier status, scan inbox into shipments. */
export function canManageShipments(
  session: Pick<SessionContext, "isAdmin" | "isProductionOperator">
): boolean {
  return session.isAdmin || session.isProductionOperator;
}
