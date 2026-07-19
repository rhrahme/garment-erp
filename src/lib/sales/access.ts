import type { SessionContext } from "@/lib/auth/session";
import type { SalesOrder } from "@/lib/types/sales-orders";

export function canAccessSalesOrder(session: SessionContext, order: SalesOrder): boolean {
  if (!session.isSalesOperator) return true;
  const owner = order.sales_owner_email?.trim().toLowerCase();
  return Boolean(owner && owner === session.email?.trim().toLowerCase());
}

export function filterSalesOrdersForSession(
  session: SessionContext,
  orders: SalesOrder[]
): SalesOrder[] {
  return session.isSalesOperator
    ? orders.filter((order) => canAccessSalesOrder(session, order))
    : orders;
}
