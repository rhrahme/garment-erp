import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  getPatternAlterationPendingById,
  updatePatternAlterationPending,
} from "@/lib/data/pattern-alteration-pending";
import { notifyIntegration } from "@/lib/integrations";
import type { PatternAlterationPendingItem } from "@/lib/types/pattern-alteration-pending";

type ActionResult =
  | { ok: true; item: PatternAlterationPendingItem }
  | { ok: false; error: string; status: number };

export async function acknowledgePatternAlterationPending(
  id: string,
  by: string,
  source: "erp" | "zapier" | "api" = "erp"
): Promise<ActionResult> {
  await ensureDocumentsLoaded(["pattern_alteration_pending"]);
  const current = getPatternAlterationPendingById(id);
  if (!current) return { ok: false, error: "Pending alteration not found.", status: 404 };
  if (current.status === "chart_updated") {
    return { ok: false, error: "Chart already marked updated.", status: 409 };
  }
  if (current.status === "acknowledged") {
    return { ok: true, item: current };
  }

  const item = await updatePatternAlterationPending(id, {
    status: "acknowledged",
    acknowledged_at: new Date().toISOString(),
    acknowledged_by: by,
  });
  if (!item) return { ok: false, error: "Pending alteration not found.", status: 404 };

  try {
    await notifyIntegration(
      "pattern.alteration_chart_acknowledged",
      {
        pending_id: item.id,
        session_id: item.session_id,
        production_code: item.production_code,
        so_number: item.so_number,
        fabric_number: item.fabric_number,
        acknowledged_by: by,
        acknowledged_at: item.acknowledged_at,
      },
      source
    );
  } catch (error) {
    console.error("Failed to notify pattern.alteration_chart_acknowledged:", item.id, error);
  }

  return { ok: true, item };
}

export async function markPatternAlterationChartUpdated(
  id: string,
  by: string,
  source: "erp" | "zapier" | "api" = "erp"
): Promise<ActionResult> {
  await ensureDocumentsLoaded(["pattern_alteration_pending"]);
  const current = getPatternAlterationPendingById(id);
  if (!current) return { ok: false, error: "Pending alteration not found.", status: 404 };
  if (current.status === "chart_updated") {
    return { ok: true, item: current };
  }

  const now = new Date().toISOString();
  const item = await updatePatternAlterationPending(id, {
    status: "chart_updated",
    acknowledged_at: current.acknowledged_at ?? now,
    acknowledged_by: current.acknowledged_by ?? by,
    chart_updated_at: now,
    chart_updated_by: by,
  });
  if (!item) return { ok: false, error: "Pending alteration not found.", status: 404 };

  try {
    await notifyIntegration(
      "pattern.alteration_chart_updated",
      {
        pending_id: item.id,
        session_id: item.session_id,
        production_code: item.production_code,
        so_number: item.so_number,
        fabric_number: item.fabric_number,
        related_articles: item.related_articles,
        chart_updated_by: by,
        chart_updated_at: item.chart_updated_at,
      },
      source
    );
  } catch (error) {
    console.error("Failed to notify pattern.alteration_chart_updated:", item.id, error);
  }

  return { ok: true, item };
}
