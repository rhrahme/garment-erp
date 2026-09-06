import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectSewingSessionChangeRequestIds } from "@/lib/production/sewing-session-change-request-ids";

describe("collectSewingSessionChangeRequestIds", () => {
  it("keeps a single request_id", () => {
    assert.deepEqual(collectSewingSessionChangeRequestIds({ request_id: " sscr-1 " }), [
      "sscr-1",
    ]);
  });

  it("dedupes request_id plus request_ids", () => {
    assert.deepEqual(
      collectSewingSessionChangeRequestIds({
        request_id: "sscr-1",
        request_ids: ["sscr-2", "sscr-1", "  sscr-3  ", "", 4],
      }),
      ["sscr-1", "sscr-2", "sscr-3"]
    );
  });

  it("returns empty when nothing valid is sent", () => {
    assert.deepEqual(collectSewingSessionChangeRequestIds({}), []);
    assert.deepEqual(collectSewingSessionChangeRequestIds({ request_ids: "sscr-1" }), []);
  });
});
