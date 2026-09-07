import path from "path";
import { formatActivityActor } from "@/lib/activity/team";
import { articleLabelFromNumber } from "@/lib/activity/when";
import { readJsonFileFreshAsync, saveDocument } from "@/lib/data/document-persistence";
import type { ActivityEvent, ActivityEventsFile } from "@/lib/types/activity-events";

const STORE_PATH = path.join(process.cwd(), "src/data/activity-events.json");
const EMPTY: ActivityEventsFile = { updated_at: null, events: [] };
const MAX_EVENTS = 20000;

export async function readActivityEventsFresh(): Promise<ActivityEventsFile> {
  return readJsonFileFreshAsync(STORE_PATH, EMPTY, { force: true });
}

export async function listActivityEvents(limit = 200): Promise<ActivityEvent[]> {
  const store = await readActivityEventsFresh();
  return (store.events ?? []).slice(0, limit);
}

export async function listActivityForSalesOrder(input: {
  soNumber?: string | null;
  orderId?: string | null;
}): Promise<ActivityEvent[]> {
  const soNumber = input.soNumber?.trim().toUpperCase() ?? "";
  const orderId = input.orderId?.trim() ?? "";
  if (!soNumber && !orderId) return [];
  const store = await readActivityEventsFresh();
  return (store.events ?? []).filter((event) => {
    if (soNumber && event.so_number?.toUpperCase() === soNumber) return true;
    if (orderId && event.order_id === orderId) return true;
    return false;
  });
}

/** Never drop an order's own rows when the house-wide cap is hit. */
export function trimActivityStore(
  events: ActivityEvent[],
  incoming: Pick<ActivityEvent, "so_number" | "order_id">,
  max = MAX_EVENTS
): ActivityEvent[] {
  if (events.length <= max) return events;
  const keep = (event: ActivityEvent) =>
    Boolean(
      (incoming.so_number && event.so_number === incoming.so_number) ||
        (incoming.order_id && event.order_id === incoming.order_id)
    );
  const sameOrder = events.filter(keep);
  const others = events.filter((event) => !keep(event));
  const room = Math.max(max - sameOrder.length, 0);
  return [...sameOrder, ...others.slice(0, room)];
}

function pickString(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function activitySummaryForEvent(event: string, data: Record<string, unknown>): string {
  const so = pickString(data, ["so_number"]);
  const client = pickString(data, ["client_name"]);
  const fabric = pickString(data, ["fabric_number"]);
  const article =
    pickString(data, ["article_label", "product_article", "article"]) ??
    articleLabelFromNumber(typeof data.article_number === "number" ? data.article_number : null);
  const brand = pickString(data, ["retail_brand", "brand"]);
  switch (event) {
    case "sales_order.created":
      return so ? `Created ${so}` : "Created sales order";
    case "sales_order.fabric_lines_added":
      return fabric ? `Added fabric ${fabric}` : "Added fabric line";
    case "sales_order.fabric_lines_updated":
      return fabric ? `Edited fabric ${fabric}` : "Edited fabric line";
    case "sales_order.fabric_lines_removed":
      return fabric ? `Removed fabric ${fabric}` : "Removed fabric line";
    case "sales_order.garment_type_changed":
      return article ? `Changed garment type on ${article}` : "Changed garment type";
    case "sales_order.fabric_changed":
      return fabric ? `Changed fabric ${fabric}` : "Changed fabric";
    case "sales_order.fabric_order_requested":
      return so ? `Requested fabric order for ${so}` : "Requested fabric order";
    case "sales_order.marked_ready_made":
      return `Moved to Ready-Made${brand ? ` / ${brand}` : ""}${article ? ` (${article})` : ""}`;
    case "sales_order.deleted":
      return so ? `Deleted ${so}` : "Deleted sales order";
    case "pattern_library.file_uploaded":
    case "client_pattern.tud_version_uploaded":
    case "client_pattern.marker_uploaded":
    case "entity.image_uploaded":
    case "sales_client_photo.uploaded":
    case "ready_made.catalog_image_uploaded":
    case "thread_button.photo_uploaded":
      return "Uploaded a file";
    case "client.created":
      return client ? `Created client ${client}` : "Created client";
    case "client.updated":
      return client ? `Updated client ${client}` : "Updated client";
    case "fabric.transferred":
      return "Transferred fabric";
    default:
      return event.replaceAll(".", " ").replaceAll("_", " ");
  }
}

export const RECORDED_ACTIVITY_EVENTS = new Set([
  "sales_order.created",
  "sales_order.deleted",
  "sales_order.fabric_lines_added",
  "sales_order.fabric_lines_updated",
  "sales_order.fabric_lines_removed",
  "sales_order.fabric_line_delete_requested",
  "sales_order.fabric_line_delete_approved",
  "sales_order.fabric_line_delete_rejected",
  "sales_order.garment_type_changed",
  "sales_order.fabric_changed",
  "sales_order.fabric_order_requested",
  "sales_order.marked_ready_made",
  "client.created",
  "client.updated",
  "client.name_change_requested",
  "client.name_change_approved",
  "pattern_library.file_uploaded",
  "client_pattern.created",
  "client_pattern.updated",
  "client_pattern.tud_version_uploaded",
  "client_pattern.marker_uploaded",
  "entity.image_uploaded",
  "sales_client_photo.uploaded",
  "ready_made.catalog_image_uploaded",
  "thread_button.photo_uploaded",
  "fabric.transferred",
  "base_pattern.updated",
]);

export async function recordActivityEvent(input: {
  action: string;
  data?: Record<string, unknown>;
  actorEmail?: string | null;
  actorName?: string | null;
  team?: ActivityEvent["team"];
  at?: string;
}): Promise<ActivityEvent | null> {
  if (!RECORDED_ACTIVITY_EVENTS.has(input.action)) return null;
  try {
    const data = input.data ?? {};
    const actorEmail =
      input.actorEmail?.trim() ||
      pickString(data, ["acted_by", "actor", "created_by", "added_by", "changed_by", "requested_by"]);
    const actor = formatActivityActor(actorEmail);
    const articleLabel =
      pickString(data, ["article_label"]) ??
      articleLabelFromNumber(typeof data.article_number === "number" ? data.article_number : null);
    const event: ActivityEvent = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: input.at ?? new Date().toISOString(),
      action: input.action,
      summary: activitySummaryForEvent(input.action, data),
      actor_email: actor.email,
      actor_name: input.actorName?.trim() || actor.name,
      team: input.team ?? actor.team,
      so_number: pickString(data, ["so_number"]),
      order_id: pickString(data, ["order_id", "id", "sales_order_id"]),
      client_name: pickString(data, ["client_name"]),
      article_label: articleLabel,
    };
    const store = structuredClone(await readActivityEventsFresh());
    store.events = trimActivityStore([event, ...(store.events ?? [])], event);
    store.updated_at = event.at;
    await saveDocument(STORE_PATH, store);
    return event;
  } catch (error) {
    console.error("[activity-events] record failed:", error);
    return null;
  }
}
