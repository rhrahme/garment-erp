import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  signAdminDecisionEmailToken,
  verifyAdminDecisionEmailToken,
} from "./admin-decision-email-token.ts";

describe("admin decision email token", () => {
  it("round-trips a sewing approve token", () => {
    process.env.CRON_SECRET = "test-secret";
    const token = signAdminDecisionEmailToken({
      kind: "sewing_session",
      request_id: "req-1",
      requested_at: "2026-08-19T00:00:00.000Z",
      action: "approve",
      admin_email: "admin@hagan.pro",
      exp: Date.now() + 60_000,
    });
    const verified = verifyAdminDecisionEmailToken(token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    assert.equal(verified.payload.kind, "sewing_session");
    if (verified.payload.kind === "sewing_session") {
      assert.equal(verified.payload.request_id, "req-1");
    }
  });

  it("rejects a tampered token", () => {
    process.env.CRON_SECRET = "test-secret";
    const token = signAdminDecisionEmailToken({
      kind: "fabric_line_delete",
      order_id: "so-1",
      line_id: "line-1",
      requested_at: "2026-08-19T00:00:00.000Z",
      action: "reject",
      admin_email: "admin@hagan.pro",
      exp: Date.now() + 60_000,
    });
    const verified = verifyAdminDecisionEmailToken(`${token}x`);
    assert.equal(verified.ok, false);
  });
});
