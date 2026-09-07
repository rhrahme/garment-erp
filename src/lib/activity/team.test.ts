import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activityFromSalesOrderHistory } from "@/lib/activity/order-trace";
import { activityTeamFromEmail, formatActivityActor } from "@/lib/activity/team";
import { activitySummaryForEvent } from "@/lib/data/activity-events";
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
