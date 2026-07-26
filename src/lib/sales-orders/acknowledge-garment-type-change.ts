import { markGarmentTypeChangeAcknowledged } from "@/lib/data/garment-type-changes";
import { notifyIntegration } from "@/lib/integrations";
import type { GarmentTypeChange } from "@/lib/types/garment-type-changes";

export async function acknowledgeGarmentTypeChange(
  changeId: string,
  acknowledgedBy: string
): Promise<{ ok: true; change: GarmentTypeChange } | { ok: false; status: number; error: string }> {
  const trimmedId = changeId.trim();
  if (!trimmedId) {
    return { ok: false, status: 400, error: "change id is required." };
  }

  const result = await markGarmentTypeChangeAcknowledged(trimmedId, acknowledgedBy);
  if (!result) {
    return { ok: false, status: 404, error: "Garment type change not found." };
  }

  if (result.newlyAcknowledged) {
    const change = result.change;
    await notifyIntegration("sales_order.garment_type_change_acknowledged", {
      change_id: change.id,
      sales_order_id: change.sales_order_id,
      so_number: change.so_number,
      line_id: change.sales_order_line_id,
      fabric_number: change.fabric_number,
      article_number: change.article_number,
      from_garment_type: change.from_garment_type,
      to_garment_type: change.to_garment_type,
      acknowledged_at: change.acknowledged_at,
      acknowledged_by: change.acknowledged_by,
    });
  }

  return { ok: true, change: result.change };
}
