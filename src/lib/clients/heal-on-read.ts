import { ensureOrphanedClientsReconciled, type ClientDataHealResult } from "@/lib/data/clients";
import { notifyIntegration } from "@/lib/integrations";

/**
 * Shared heal for every read path that shows client names (any role):
 * restores clients-store rows orphaned by sales orders and fills blank
 * denormalized client_name / client_code on orders, then emits the matching
 * integration events. Append/repair only — never deletes or blanks data.
 */
export async function healClientDataForRead(
  source: "erp" | "api" = "erp"
): Promise<ClientDataHealResult> {
  const reconciliation = await ensureOrphanedClientsReconciled();

  for (const client of reconciliation.restored) {
    await notifyIntegration(
      "client.created",
      {
        id: client.id,
        code: client.code,
        first_name: client.first_name,
        middle_name: client.middle_name,
        last_name: client.last_name,
        brand_ids: client.brand_ids,
        restored_from: "orphan_reconciliation",
      },
      source
    );
  }

  for (const repair of reconciliation.repaired_orders) {
    await notifyIntegration(
      "sales_order.client_fields_healed",
      {
        id: repair.order_id,
        so_number: repair.so_number,
        client_id: repair.client_id,
        client_code: repair.client_code,
        client_name: repair.client_name,
        repaired_from: "clients_store",
      },
      source
    );
  }

  return reconciliation;
}
