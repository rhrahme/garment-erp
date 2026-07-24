import { randomUUID } from "crypto";
import { readSalesOrders } from "@/lib/data/sales-orders";
import {
  mutateThreadButtonMatches,
  readThreadButtonMatchesFresh,
} from "@/lib/data/thread-button-matches";
import { notifyIntegration } from "@/lib/integrations";
import { listFabricReceivingOverview } from "@/lib/production/fabric-receiving";
import {
  fabricLineArticleNumber,
  generateFabricLabelStickers,
  supplierFabricProductionCode,
} from "@/lib/sales-orders/label-codes";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";
import type {
  ThreadButtonMatchComponent,
  ThreadButtonMatchListFilter,
  ThreadButtonMatchListItem,
  ThreadButtonMatchRecord,
  ThreadButtonMatchStatus,
  ThreadButtonMatchSummary,
} from "@/lib/types/thread-button-matching";

const MATCH_STATUS_IDS = new Set<ThreadButtonMatchStatus>([
  "pending",
  "confirmed",
  "missing",
  "decision_needed",
]);

function findSalesOrderLine(
  lineId: string
): { order: SalesOrder; line: SalesOrderFabricLine; lineIndex: number } | null {
  for (const order of readSalesOrders().orders) {
    const lineIndex = order.fabric_lines.findIndex((item) => item.id === lineId);
    if (lineIndex >= 0) {
      return { order, line: order.fabric_lines[lineIndex]!, lineIndex };
    }
  }
  return null;
}

export function parseThreadButtonMatchStatus(value: unknown): ThreadButtonMatchStatus | null {
  if (typeof value !== "string") return null;
  const text = value.trim() as ThreadButtonMatchStatus;
  return MATCH_STATUS_IDS.has(text) ? text : null;
}

export function parseThreadButtonMatchComponent(
  value: unknown
): ThreadButtonMatchComponent | null {
  if (value === "thread" || value === "button") return value;
  return null;
}

function isFullyMatched(
  thread: ThreadButtonMatchStatus,
  button: ThreadButtonMatchStatus
): boolean {
  return thread === "confirmed" && button === "confirmed";
}

function needsAttention(
  thread: ThreadButtonMatchStatus,
  button: ThreadButtonMatchStatus
): boolean {
  return (
    thread === "missing" ||
    thread === "decision_needed" ||
    button === "missing" ||
    button === "decision_needed"
  );
}

function emptyMatchFields(): Pick<
  ThreadButtonMatchListItem,
  | "thread_status"
  | "button_status"
  | "thread_updated_at"
  | "thread_updated_by"
  | "button_updated_at"
  | "button_updated_by"
  | "note"
  | "match_id"
> {
  return {
    thread_status: "pending",
    button_status: "pending",
    thread_updated_at: null,
    thread_updated_by: null,
    button_updated_at: null,
    button_updated_by: null,
    note: null,
    match_id: null,
  };
}

function itemPassesFilter(
  item: ThreadButtonMatchListItem,
  filter: ThreadButtonMatchListFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "done") return item.is_fully_matched;
  if (filter === "needs_attention") return item.needs_attention;
  if (filter === "missing") {
    return item.thread_status === "missing" || item.button_status === "missing";
  }
  if (filter === "decision_needed") {
    return (
      item.thread_status === "decision_needed" || item.button_status === "decision_needed"
    );
  }
  // needs_matching — not fully confirmed yet
  return !item.is_fully_matched;
}

function buildSummary(items: ThreadButtonMatchListItem[]): ThreadButtonMatchSummary {
  const summary: ThreadButtonMatchSummary = {
    total: items.length,
    needs_matching: 0,
    needs_attention: 0,
    missing: 0,
    decision_needed: 0,
    done: 0,
  };
  for (const item of items) {
    if (item.is_fully_matched) summary.done += 1;
    else summary.needs_matching += 1;
    if (item.needs_attention) summary.needs_attention += 1;
    if (item.thread_status === "missing" || item.button_status === "missing") {
      summary.missing += 1;
    }
    if (
      item.thread_status === "decision_needed" ||
      item.button_status === "decision_needed"
    ) {
      summary.decision_needed += 1;
    }
  }
  return summary;
}

function resolveFabricCutCode(
  order: SalesOrder,
  line: SalesOrderFabricLine,
  lineIndex: number
): string {
  const stickers =
    line.label_stickers.length > 0
      ? line.label_stickers
      : generateFabricLabelStickers(
          order.client_reference ?? order.so_number,
          lineIndex + 1,
          line.garment_type
        );
  const first =
    stickers[0]?.code ??
    `${order.client_reference ?? order.so_number}-L${String(lineIndex + 1).padStart(2, "0")}`;
  return supplierFabricProductionCode(first, order.client_code);
}

function upsertMatchFromLine(
  storeMatches: ThreadButtonMatchRecord[],
  lookup: { order: SalesOrder; line: SalesOrderFabricLine; lineIndex: number },
  now: string,
  actor: string,
  component: ThreadButtonMatchComponent,
  status: ThreadButtonMatchStatus,
  note: string | null | undefined
): ThreadButtonMatchRecord {
  const { order, line, lineIndex } = lookup;
  const existing = storeMatches.find((item) => item.sales_order_line_id === line.id);
  const article_number = fabricLineArticleNumber(lineIndex);
  const fabric_cut_code = resolveFabricCutCode(order, line, lineIndex);

  if (existing) {
    existing.so_number = order.so_number;
    existing.client_id = order.client_id;
    existing.client_code = order.client_code;
    existing.client_name = order.client_name;
    existing.garment_type = line.garment_type;
    existing.fabric_number = line.fabric_number;
    existing.article_number = article_number;
    existing.fabric_cut_code = fabric_cut_code;
    existing.updated_at = now;
    if (note !== undefined) existing.note = note;
    if (component === "thread") {
      existing.thread_status = status;
      existing.thread_updated_at = now;
      existing.thread_updated_by = actor;
    } else {
      existing.button_status = status;
      existing.button_updated_at = now;
      existing.button_updated_by = actor;
    }
    return existing;
  }

  const created: ThreadButtonMatchRecord = {
    id: randomUUID(),
    sales_order_id: order.id,
    sales_order_line_id: line.id,
    so_number: order.so_number,
    client_id: order.client_id,
    client_code: order.client_code,
    client_name: order.client_name,
    garment_type: line.garment_type,
    fabric_number: line.fabric_number,
    article_number,
    fabric_cut_code,
    thread_status: component === "thread" ? status : "pending",
    button_status: component === "button" ? status : "pending",
    thread_updated_at: component === "thread" ? now : null,
    thread_updated_by: component === "thread" ? actor : null,
    button_updated_at: component === "button" ? now : null,
    button_updated_by: component === "button" ? actor : null,
    note: note ?? null,
    created_at: now,
    updated_at: now,
  };
  storeMatches.push(created);
  return created;
}

/**
 * List fabric lines on Task's receiving floor with thread/button match status overlaid.
 * Does not invent orphan lines — only SO fabric lines already in the receiving pipeline.
 */
export async function listThreadButtonMatches(options?: {
  filter?: ThreadButtonMatchListFilter;
}): Promise<{ items: ThreadButtonMatchListItem[]; summary: ThreadButtonMatchSummary }> {
  const filter = options?.filter ?? "needs_matching";
  const [overview, matchStore] = await Promise.all([
    listFabricReceivingOverview("actionable"),
    readThreadButtonMatchesFresh(),
  ]);
  const matchesByLine = new Map(
    matchStore.matches.map((item) => [item.sales_order_line_id, item] as const)
  );

  const allItems: ThreadButtonMatchListItem[] = [];
  for (const order of overview.orders) {
    for (const line of order.lines) {
      const match = matchesByLine.get(line.sales_order_line_id);
      const thread_status = match?.thread_status ?? "pending";
      const button_status = match?.button_status ?? "pending";
      allItems.push({
        sales_order_id: order.sales_order_id,
        sales_order_line_id: line.sales_order_line_id,
        receipt_id: line.receipt_id,
        so_number: order.so_number,
        client_name: order.client_name,
        client_code: order.client_code,
        article_number: line.article_number,
        garment_type: line.garment_type,
        fabric_number: line.fabric_number,
        fabric_cut_code: line.fabric_cut_code,
        receive_status: line.status,
        scan_stage_label: line.scan_stage_label,
        ...(match
          ? {
              thread_status,
              button_status,
              thread_updated_at: match.thread_updated_at,
              thread_updated_by: match.thread_updated_by,
              button_updated_at: match.button_updated_at,
              button_updated_by: match.button_updated_by,
              note: match.note,
              match_id: match.id,
            }
          : emptyMatchFields()),
        is_fully_matched: isFullyMatched(thread_status, button_status),
        needs_attention: needsAttention(thread_status, button_status),
      });
    }
  }

  allItems.sort((a, b) => {
    if (a.needs_attention !== b.needs_attention) return a.needs_attention ? -1 : 1;
    if (a.is_fully_matched !== b.is_fully_matched) return a.is_fully_matched ? 1 : -1;
    const client = a.client_name.localeCompare(b.client_name);
    if (client !== 0) return client;
    const so = a.so_number.localeCompare(b.so_number);
    if (so !== 0) return so;
    return a.article_number - b.article_number;
  });

  const summary = buildSummary(allItems);
  const items = allItems.filter((item) => itemPassesFilter(item, filter));
  return { items, summary };
}

export async function updateThreadButtonMatch(input: {
  sales_order_line_id: string;
  component: ThreadButtonMatchComponent;
  status: ThreadButtonMatchStatus;
  note?: string | null;
  actor: string;
  source?: "erp" | "api";
}): Promise<ThreadButtonMatchRecord> {
  const lineId = input.sales_order_line_id.trim();
  if (!lineId) throw new Error("sales_order_line_id is required.");
  if (!MATCH_STATUS_IDS.has(input.status)) throw new Error("Invalid match status.");
  if (input.component !== "thread" && input.component !== "button") {
    throw new Error('component must be "thread" or "button".');
  }

  const lookup = findSalesOrderLine(lineId);
  if (!lookup) throw new Error("Sales order fabric line not found.");

  const note =
    input.note === undefined
      ? undefined
      : input.note == null
        ? null
        : String(input.note).trim().slice(0, 500) || null;
  const actor = input.actor.trim() || "unknown";
  const now = new Date().toISOString();

  const record = await mutateThreadButtonMatches((store) =>
    structuredClone(
      upsertMatchFromLine(
        store.matches,
        lookup,
        now,
        actor,
        input.component,
        input.status,
        note
      )
    )
  );

  await notifyIntegration(
    "thread_button.match_updated",
    {
      match_id: record.id,
      sales_order_id: record.sales_order_id,
      sales_order_line_id: record.sales_order_line_id,
      so_number: record.so_number,
      client_name: record.client_name,
      client_code: record.client_code,
      fabric_number: record.fabric_number,
      garment_type: record.garment_type,
      article_number: record.article_number,
      fabric_cut_code: record.fabric_cut_code,
      component: input.component,
      status: input.status,
      thread_status: record.thread_status,
      button_status: record.button_status,
      note: record.note,
      actor,
      updated_at: record.updated_at,
    },
    input.source ?? "erp"
  );

  return record;
}
