import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activityFromSalesOrderHistory } from "@/lib/activity/order-trace";
import { activityTeamFromEmail, formatActivityActor } from "@/lib/activity/team";
import { formatActivityDateTime } from "@/lib/activity/when";
import { activitySummaryForEvent, trimActivityStore } from "@/lib/data/activity-events";
import type { ActivityEvent } from "@/lib/types/activity-events";
import type { GarmentTypeChange } from "@/lib/types/garment-type-changes";
import type { SalesOrder } from "@/lib/types/sales-orders";

describe("activity team", () => {
  it("maps known floor mailboxes to a team, not a row color", () => {
    assert.equal(activityTeamFromEmail("hagan.qc@gmail.com"), "qc");
    assert.equal(activityTeamFromEmail("hagan.task1@gmail.com"), "task");
    assert.equal(activityTeamFromEmail("hagan.dp1@gmail.com"), "pattern");
    assert.equal(formatActivityActor("hagan.qc@gmail.com").name, "QC Hossein");
  });
});

describe("order activity history", () => {
  it("names who created the order and who added a later fabric line", () => {
    const order = {
      id: "so-1",
      so_number: "SO-2026-0140",
      client_name: "Mohammad Al Sheikh",
      order_date: "2026-07-26",
      created_by: "hagan.qc@gmail.com",
      fabric_lines: [
        {
          id: "line-1",
          fabric_number: "360103",
          added_at: "2026-08-01T10:00:00.000Z",
          added_by: "hagan.qc@gmail.com",
        },
      ],
    } as unknown as SalesOrder;
    const rows = activityFromSalesOrderHistory({ order });
    assert.equal(rows.some((row) => row.summary === "Created SO-2026-0140"), true);
    assert.equal(rows.some((row) => row.actor_name === "QC Hossein"), true);
    assert.equal(rows.some((row) => row.summary === "Added fabric 360103"), true);
  });

  it("keeps the full log when the same article is updated several times", () => {
    const order = {
      id: "so-1",
      so_number: "SO-2026-0140",
      client_name: "Mohammad Al Sheikh",
      order_date: "2026-07-26",
      created_by: "hagan.qc@gmail.com",
      fabric_lines: [],
    } as unknown as SalesOrder;
    const garmentChanges = [
      {
        id: "g1",
        changed_at: "2026-08-01T08:00:00.000Z",
        changed_by: "hagan.qc@gmail.com",
        sales_order_id: "so-1",
        so_number: "SO-2026-0140",
        article_number: 1,
        from_garment_type: "Shirt",
        to_garment_type: "Shirt LS",
        client_name: "Mohammad Al Sheikh",
      },
      {
        id: "g2",
        changed_at: "2026-08-03T11:30:00.000Z",
        changed_by: "hagan.dp1@gmail.com",
        sales_order_id: "so-1",
        so_number: "SO-2026-0140",
        article_number: 1,
        from_garment_type: "Shirt LS",
        to_garment_type: "Overshirt",
        client_name: "Mohammad Al Sheikh",
      },
      {
        id: "g3",
        changed_at: "2026-08-05T15:45:00.000Z",
        changed_by: "hagan.qc@gmail.com",
        sales_order_id: "so-1",
        so_number: "SO-2026-0140",
        article_number: 1,
        from_garment_type: "Overshirt",
        to_garment_type: "Jacket",
        client_name: "Mohammad Al Sheikh",
      },
    ] as GarmentTypeChange[];
    const rows = activityFromSalesOrderHistory({ order, garmentChanges });
    const articleRows = rows.filter((row) => row.article_label === "L01");
    assert.equal(articleRows.length, 3);
    assert.equal(articleRows.filter((row) => row.action === "sales_order.garment_type_changed").length, 3);
  });
});

describe("activity date and time", () => {
  it("prints a Riyadh date and time", () => {
    const when = formatActivityDateTime("2026-08-05T12:45:00.000Z");
    assert.match(when.date, /2026/);
    assert.match(when.time, /\d{2}:\d{2}/);
    assert.match(when.label, /2026/);
  });
});

describe("activity store trim", () => {
  it("does not drop an order's own updates when the house log is full", () => {
    const incoming = {
      id: "new",
      at: "2026-09-07T10:00:00.000Z",
      action: "sales_order.fabric_lines_updated",
      summary: "Edited fabric 360103",
      actor_email: "hagan.qc@gmail.com",
      actor_name: "QC Hossein",
      team: "qc" as const,
      so_number: "SO-2026-0140",
      order_id: "so-1",
      client_name: "Mohammad Al Sheikh",
      article_label: "L01",
    };
    const olderSameArticle: ActivityEvent = {
      ...incoming,
      id: "old-l01",
      at: "2026-08-01T10:00:00.000Z",
      summary: "Changed garment type on L01",
    };
    const other: ActivityEvent = {
      ...incoming,
      id: "other",
      so_number: "SO-2026-0001",
      order_id: "so-other",
      article_label: "L02",
    };
    const trimmed = trimActivityStore([incoming, olderSameArticle, other], incoming, 2);
    assert.equal(trimmed.some((row) => row.id === "new"), true);
    assert.equal(trimmed.some((row) => row.id === "old-l01"), true);
  });
});

describe("activity summaries", () => {
  it("does not treat a Ready-Made default as an edit", () => {
    assert.equal(
      activitySummaryForEvent("sales_order.marked_ready_made", {
        retail_brand: "Boggi",
        product_article: "Overcoat",
      }),
      "Moved to Ready-Made / Boggi (Overcoat)"
    );
  });
});
