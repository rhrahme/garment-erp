import {
  appendFabricChangeAlert,
  markFabricChangeAlertAdminNotified,
} from "@/lib/data/fabric-change-alerts";
import { notifyIntegration } from "@/lib/integrations";
import { notifyAdminsOfFabricChange } from "@/lib/integrations/fabric-change-alert-email";
import { activePatternJobsForLine } from "@/lib/pattern/sync-guard";
import {
  changedFieldsSummary,
  fabricLineMeaningfullyChanged,
  shouldRecordFabricChangeAlert,
  snapshotFabricLine,
  type FabricChangeSnapshot,
} from "@/lib/sales-orders/fabric-change-alert-gates";
import { fabricLineArticleNumber } from "@/lib/sales-orders/label-codes";
import type {
  FabricChangeAlert,
  FabricChangeAlertKind,
} from "@/lib/types/fabric-change-alerts";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

export {
  fabricLineMeaningfullyChanged,
  lineHasPrintEvidence,
  orderHasFabricPosLock,
  shouldRecordFabricChangeAlert,
  snapshotFabricLine,
  type FabricChangeSnapshot,
} from "@/lib/sales-orders/fabric-change-alert-gates";

export type RecordFabricChangeAlertInput = {
  kind: FabricChangeAlertKind;
  order: SalesOrder;
  lineId: string | null;
  before: FabricChangeSnapshot | null;
  after: FabricChangeSnapshot | null;
  createdBy: string;
  articleNumber?: number | null;
  force?: boolean;
  notify?: boolean;
  /** Print/pattern flags taken from the line before mutation when it was removed. */
  evidenceLine?: SalesOrderFabricLine | null;
};

export async function recordFabricChangeAlert(
  input: RecordFabricChangeAlertInput
): Promise<FabricChangeAlert | null> {
  const evidence =
    input.evidenceLine ??
    (input.lineId
      ? input.order.fabric_lines.find((line) => line.id === input.lineId) ?? null
      : null) ??
    (input.after
      ? input.order.fabric_lines.find(
          (line) =>
            line.fabric_number.toLowerCase() === input.after!.fabric_number.toLowerCase()
        ) ?? null
      : null);

  if (!shouldRecordFabricChangeAlert(input.order, evidence, { force: input.force })) {
    return null;
  }

  if (
    input.kind === "line_edited" &&
    input.before &&
    input.after &&
    !fabricLineMeaningfullyChanged(input.before, input.after)
  ) {
    return null;
  }

  const lineIndex =
    input.lineId != null
      ? input.order.fabric_lines.findIndex((line) => line.id === input.lineId)
      : -1;
  const articleNumber =
    input.articleNumber ??
    (lineIndex >= 0 ? fabricLineArticleNumber(lineIndex) : null);

  const hadPatternWork = evidence
    ? activePatternJobsForLine(input.order.id, evidence.id) > 0
    : input.order.fabric_lines.some(
        (line) => activePatternJobsForLine(input.order.id, line.id) > 0
      );

  const summary = changedFieldsSummary(input.before, input.after);
  const fabricNumber =
    input.after?.fabric_number ?? input.before?.fabric_number ?? evidence?.fabric_number ?? null;

  const alert: FabricChangeAlert = {
    id: `fca-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    created_by: input.createdBy,
    kind: input.kind,
    sales_order_id: input.order.id,
    so_number: input.order.so_number,
    sales_order_line_id: input.lineId,
    client_id: input.order.client_id,
    client_name: input.order.client_name,
    client_code: input.order.client_code,
    article_number: articleNumber,
    fabric_number: fabricNumber,
    summary,
    from_fabric_number: input.before?.fabric_number ?? null,
    to_fabric_number: input.after?.fabric_number ?? null,
    from_supplier_name: input.before?.supplier_name ?? null,
    to_supplier_name: input.after?.supplier_name ?? null,
    from_meters: input.before?.quantity ?? null,
    to_meters: input.after?.quantity ?? null,
    from_garment_type: input.before?.garment_type ?? null,
    to_garment_type: input.after?.garment_type ?? null,
    had_a4_printed: Boolean(evidence?.a4_printed_at),
    had_prep_stickers: Boolean(evidence?.prep_stickers_printed_at),
    had_prod_stickers: Boolean(evidence?.prod_stickers_printed_at),
    had_pattern_work: hadPatternWork,
    had_fabric_pos: input.order.status === "fabric_pos_created" || input.order.fabric_po_ids.length > 0,
    acknowledgements: {},
    admin_notified_at: null,
  };

  await appendFabricChangeAlert(alert);

  if (input.notify !== false) {
    await notifyIntegration("sales_order.fabric_changed", {
      alert_id: alert.id,
      kind: alert.kind,
      sales_order_id: alert.sales_order_id,
      so_number: alert.so_number,
      line_id: alert.sales_order_line_id,
      client_id: alert.client_id,
      client_name: alert.client_name,
      client_code: alert.client_code,
      article_number: alert.article_number,
      fabric_number: alert.fabric_number,
      summary: alert.summary,
      from_fabric_number: alert.from_fabric_number,
      to_fabric_number: alert.to_fabric_number,
      from_supplier_name: alert.from_supplier_name,
      to_supplier_name: alert.to_supplier_name,
      from_meters: alert.from_meters,
      to_meters: alert.to_meters,
      from_garment_type: alert.from_garment_type,
      to_garment_type: alert.to_garment_type,
      had_a4_printed: alert.had_a4_printed,
      had_prep_stickers: alert.had_prep_stickers,
      had_prod_stickers: alert.had_prod_stickers,
      had_pattern_work: alert.had_pattern_work,
      had_fabric_pos: alert.had_fabric_pos,
      created_by: alert.created_by,
      reprint_required: true,
    });

    const emailed = await notifyAdminsOfFabricChange(alert);
    if (emailed) {
      await markFabricChangeAlertAdminNotified(alert.id);
      alert.admin_notified_at = new Date().toISOString();
    }
  }

  return alert;
}
