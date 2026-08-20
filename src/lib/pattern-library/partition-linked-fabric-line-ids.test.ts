import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allRequestedLinesRemovedFromOrdersError,
  missingClientFabricLinesError,
  orphanLineIdsForClient,
  partitionLinkedFabricLineIds,
} from "./partition-linked-fabric-line-ids.ts";

describe("partitionLinkedFabricLineIds", () => {
  it("keeps live SO lines and skips leftover pattern-job line ids", () => {
    const result = partitionLinkedFabricLineIds({
      requested: [
        "line-live-1",
        "line-1785092563536-16",
        "line-live-1",
        " line-live-2 ",
      ],
      validLineIds: new Set(["line-live-1", "line-live-2"]),
      orphanLineIds: new Set([
        "line-1785092563536-16",
        "line-1785092563536-15",
      ]),
    });
    assert.deepEqual(result.linked, ["line-live-1", "line-live-2"]);
    assert.deepEqual(result.skippedOrphans, ["line-1785092563536-16"]);
    assert.deepEqual(result.unknown, []);
  });

  it("still rejects ids that are neither on the SO nor leftover jobs", () => {
    const result = partitionLinkedFabricLineIds({
      requested: ["line-live-1", "line-typo"],
      validLineIds: new Set(["line-live-1"]),
      orphanLineIds: new Set(["line-orphan"]),
    });
    assert.deepEqual(result.linked, ["line-live-1"]);
    assert.deepEqual(result.unknown, ["line-typo"]);
  });
});

describe("orphanLineIdsForClient", () => {
  it("collects pending jobs whose SO line is gone", () => {
    const orphans = orphanLineIdsForClient(
      "client-ibrahim",
      [
        {
          client_id: "client-ibrahim",
          status: "pending",
          sales_order_line_id: "line-1785092563536-12",
        },
        {
          client_id: "client-ibrahim",
          status: "cancelled",
          sales_order_line_id: "line-old-cancelled",
        },
        {
          client_id: "other",
          status: "pending",
          sales_order_line_id: "line-other",
        },
        {
          client_id: "client-ibrahim",
          status: "pending",
          sales_order_line_id: "line-live",
        },
      ],
      new Set(["line-live"])
    );
    assert.deepEqual([...orphans], ["line-1785092563536-12"]);
  });
});

describe("linked fabric line error copy", () => {
  it("keeps the unknown-id wording for true misses", () => {
    assert.match(
      missingClientFabricLinesError(["line-x"]),
      /not found on this client's sales orders: line-x/
    );
  });

  it("explains a batch that is only leftover removed lines", () => {
    assert.match(allRequestedLinesRemovedFromOrdersError(), /still on the order/i);
    assert.match(allRequestedLinesRemovedFromOrdersError(), /QC/);
  });
});
