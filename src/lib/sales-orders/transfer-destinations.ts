import { readClients } from "@/lib/data/clients";
import { readSalesOrders } from "@/lib/data/sales-orders";
import { filterSalesOrdersForSession } from "@/lib/sales/access";
import type { SessionContext } from "@/lib/auth/session";
import type { SalesOrder } from "@/lib/types/sales-orders";

export type FabricTransferDestination = {
  id: string;
  so_number: string;
  client_id: string;
  client_code: string;
  client_name: string;
  status: string;
};

/** Open bespoke orders eligible as transfer destinations (lightweight — no fabric lines). */
export function listFabricTransferDestinations(
  sourceOrderId: string,
  session: Pick<SessionContext, "email" | "isSalesOperator">,
  orders: SalesOrder[] = readSalesOrders().orders
): FabricTransferDestination[] {
  const clients = readClients().clients;
  const visibleOrders = filterSalesOrdersForSession(session, orders, clients);

  return visibleOrders
    .filter(
      (order) =>
        order.id !== sourceOrderId &&
        order.status !== "complete" &&
        !order.retail_brand?.trim()
    )
    .map((order) => ({
      id: order.id,
      so_number: order.so_number,
      client_id: order.client_id,
      client_code: order.client_code,
      client_name: order.client_name,
      status: order.status,
    }))
    .sort(
      (a, b) =>
        a.client_name.localeCompare(b.client_name) || a.so_number.localeCompare(b.so_number)
    );
}
