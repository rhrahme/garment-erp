import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  getPatternAlterationPendingBySessionId,
  upsertPatternAlterationPending,
} from "@/lib/data/pattern-alteration-pending";
import { readSalesOrders } from "@/lib/data/sales-orders";
import { readSewingSessionsAsync } from "@/lib/data/sewing-sessions";
import { notifyIntegration } from "@/lib/integrations";
import { resolveClientPatternForAlteration } from "@/lib/pattern/resolve-client-pattern-for-alteration";
import { resolveSoArticleForFabricLine } from "@/lib/sales-orders/label-codes";
import type {
  PatternAlterationPendingItem,
  PatternAlterationRelatedArticle,
} from "@/lib/types/pattern-alteration-pending";
import type { SewingSession } from "@/lib/types/sewing-sessions";

function relatedArticlesForSession(session: SewingSession): PatternAlterationRelatedArticle[] {
  const soNumber = session.so_number?.trim();
  const fabric = session.fabric_number?.trim().toLowerCase();
  if (!soNumber || !fabric) return [];

  const order = readSalesOrders().orders.find((row) => row.so_number === soNumber);
  if (!order) return [];

  const related: PatternAlterationRelatedArticle[] = [];
  (order.fabric_lines ?? []).forEach((line, index) => {
    const lineFabric = String(line.fabric_number ?? "").trim().toLowerCase();
    if (!lineFabric || lineFabric !== fabric) return;
    const firstSticker = (line.label_stickers ?? [])[0];
    related.push({
      sales_order_line_id: line.id ?? null,
      article_number: resolveSoArticleForFabricLine(line, index),
      garment_type: line.garment_type?.trim() || null,
      fabric_number: line.fabric_number?.trim() || null,
      production_code: firstSticker?.code?.trim() || null,
    });
  });
  return related;
}

/**
 * Persist Pattern chart-pending item when a tailor starts an alteration session.
 * Fans out related articles on the same SO sharing the same fabric number.
 * Idempotent per session_id - safe to retry after a failed notify/write.
 */
export async function recordPatternAlterationPendingFromSession(
  session: SewingSession,
  source: "erp" | "zapier" | "api" = "erp"
): Promise<PatternAlterationPendingItem | null> {
  if (session.work_kind !== "alteration") return null;

  await ensureDocumentsLoaded([
    "sales_orders",
    "pattern_alteration_pending",
    "pattern_library",
  ]);

  const existing = getPatternAlterationPendingBySessionId(session.id);
  if (existing) return existing;

  const order = session.so_number
    ? readSalesOrders().orders.find((row) => row.so_number === session.so_number)
    : null;

  const related_articles = relatedArticlesForSession(session);
  const draftForResolve = {
    client_id: order?.client_id ?? null,
    garment_type: session.garment_type ?? null,
    related_articles,
    client_pattern_id: null as string | null,
  };
  const linkedPattern = resolveClientPatternForAlteration(draftForResolve);

  const item: PatternAlterationPendingItem = {
    id: `alt-pending-${session.id}`,
    created_at: session.started_at || new Date().toISOString(),
    status: "pending",
    session_id: session.id,
    employee_id: session.employee_id,
    employee_name: session.employee_name,
    employee_id_number: session.employee_id_number,
    production_code: session.production_code,
    scan_code: session.scan_code,
    so_number: session.so_number,
    sales_order_id: order?.id ?? null,
    client_id: order?.client_id ?? null,
    client_name: session.client_name ?? order?.client_name ?? null,
    client_code: order?.client_code ?? null,
    fabric_number: session.fabric_number ?? null,
    garment_type: session.garment_type ?? null,
    piece_mark: session.piece_mark ?? null,
    fabric_cut_code: session.fabric_cut_code ?? null,
    related_articles,
    stitcher_comments: null,
    stitcher_comments_at: null,
    stitcher_comments_by: null,
    client_pattern_id: linkedPattern?.id ?? null,
    acknowledged_at: null,
    acknowledged_by: null,
    chart_updated_at: null,
    chart_updated_by: null,
  };

  const { item: saved, created } = await upsertPatternAlterationPending(item);
  if (!created) return saved;

  const payload = {
    pending_id: saved.id,
    session_id: saved.session_id,
    employee_id: saved.employee_id,
    employee_name: saved.employee_name,
    production_code: saved.production_code,
    so_number: saved.so_number,
    sales_order_id: saved.sales_order_id,
    client_id: saved.client_id,
    client_code: saved.client_code,
    client_name: saved.client_name,
    fabric_number: saved.fabric_number,
    garment_type: saved.garment_type,
    piece_mark: saved.piece_mark,
    related_articles: saved.related_articles,
    started_at: saved.created_at,
  };

  // Pending row is already durable � never roll back the queue on webhook failure.
  try {
    await notifyIntegration("production.alteration_started", payload, source);
    await notifyIntegration("pattern.alteration_chart_pending", payload, source);
  } catch (error) {
    console.error(
      "Failed to notify pattern alteration pending webhooks for",
      saved.id,
      error
    );
  }

  return saved;
}

/**
 * Soft side-effect after an alteration session is durable: never throw to the
 * stitch scan path. Pending row + webhooks are best-effort with heal fallback.
 */
export async function safeRecordPatternAlterationPendingFromSession(
  session: SewingSession,
  source: "erp" | "zapier" | "api" = "erp"
): Promise<PatternAlterationPendingItem | null> {
  try {
    return await recordPatternAlterationPendingFromSession(session, source);
  } catch (error) {
    console.error(
      "Failed to record pattern alteration pending for session",
      session.id,
      error
    );
    return null;
  }
}

/**
 * Create missing pending rows for open/closing alteration sessions.
 * Called when Pattern opens the queue so a failed start-side write cannot hide work.
 */
export async function healMissingPatternAlterationPendingFromOpenSessions(): Promise<number> {
  await ensureDocumentsLoaded([
    "sewing_sessions",
    "pattern_alteration_pending",
    "sales_orders",
  ]);
  const store = await readSewingSessionsAsync();
  let created = 0;
  for (const session of store.sessions) {
    if (session.work_kind !== "alteration") continue;
    if (session.status !== "open" && session.status !== "closing") continue;
    if (getPatternAlterationPendingBySessionId(session.id)) continue;
    const item = await recordPatternAlterationPendingFromSession(session, "erp");
    if (item) created += 1;
  }
  return created;
}
