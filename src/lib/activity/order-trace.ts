import { formatActivityActor } from "@/lib/activity/team";
import { articleLabelFromNumber } from "@/lib/activity/when";
import type { ActivityEvent } from "@/lib/types/activity-events";
import type { GarmentTypeChange } from "@/lib/types/garment-type-changes";
import type { SalesOrder } from "@/lib/types/sales-orders";

function row(input: {
  id: string;
  at: string;
  action: string;
  summary: string;
  email?: string | null;
  soNumber?: string | null;
  orderId?: string | null;
  clientName?: string | null;
  articleLabel?: string | null;
}): ActivityEvent {
  const actor = formatActivityActor(input.email);
  return {
    id: input.id,
    at: input.at,
    action: input.action,
    summary: input.summary,
    actor_email: actor.email,
    actor_name: actor.name,
    team: actor.team,
    so_number: input.soNumber ?? null,
    order_id: input.orderId ?? null,
    client_name: input.clientName ?? null,
    article_label: input.articleLabel ?? null,
  };
}

/** Who already left a fingerprint on this order before the activity store existed. */
export function activityFromSalesOrderHistory(input: {
  order: SalesOrder;
  garmentChanges?: GarmentTypeChange[];
  storedEvents?: ActivityEvent[];
}): ActivityEvent[] {
  const { order } = input;
  const rows: ActivityEvent[] = (input.storedEvents ?? []).map((event) => ({
    ...event,
    article_label: event.article_label ?? null,
  }));

  if (order.created_by || order.order_date) {
    rows.push(
      row({
        id: `hist-created-${order.id}`,
        at: order.order_date ? `${order.order_date}T00:00:00.000Z` : "1970-01-01T00:00:00.000Z",
        action: "sales_order.created",
        summary: `Created ${order.so_number}`,
        email: order.created_by,
        soNumber: order.so_number,
        orderId: order.id,
        clientName: order.client_name,
      })
    );
  }

  if (order.fabric_order_requested_at && order.fabric_order_requested_by) {
    rows.push(
      row({
        id: `hist-po-req-${order.id}`,
        at: order.fabric_order_requested_at,
        action: "sales_order.fabric_order_requested",
        summary: `Requested fabric order for ${order.so_number}`,
        email: order.fabric_order_requested_by,
        soNumber: order.so_number,
        orderId: order.id,
        clientName: order.client_name,
      })
    );
  }

  for (const line of order.fabric_lines) {
    if (!line.added_by || !line.added_at) continue;
    rows.push(
      row({
        id: `hist-line-${line.id}`,
        at: line.added_at,
        action: "sales_order.fabric_lines_added",
        summary: line.fabric_number
          ? `Added fabric ${line.fabric_number}`
          : "Added fabric line",
        email: line.added_by,
        soNumber: order.so_number,
        orderId: order.id,
        clientName: order.client_name,
      })
    );
  }

  for (const change of input.garmentChanges ?? []) {
    const articleLabel = articleLabelFromNumber(change.article_number);
    rows.push(
      row({
        id: change.id,
        at: change.changed_at,
        action: "sales_order.garment_type_changed",
        summary: `Changed ${change.from_garment_type} to ${change.to_garment_type}`,
        email: change.changed_by,
        soNumber: change.so_number,
        orderId: change.sales_order_id,
        clientName: change.client_name,
        articleLabel,
      })
    );
  }

  // Drop only exact twins (history row + stored copy of the same moment).
  // Several updates on the same article stay - each has its own time.
  const seen = new Set<string>();
  return rows
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
    .filter((event) => {
      const key = `${event.id}|${event.action}|${event.at}|${event.actor_email ?? ""}|${event.summary}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
