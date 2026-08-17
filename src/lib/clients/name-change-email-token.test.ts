import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  NAME_CHANGE_EMAIL_TOKEN_TTL_MS,
  signNameChangeEmailToken,
  verifyNameChangeEmailToken,
  type NameChangeEmailTokenPayload,
} from "./name-change-email-token";

function payload(overrides: Partial<NameChangeEmailTokenPayload> = {}): NameChangeEmailTokenPayload {
  return {
    client_id: "client-1",
    action: "approve",
    requested_at: "2026-08-17T10:00:00.000Z",
    admin_email: "admin@example.com",
    exp: Date.now() + NAME_CHANGE_EMAIL_TOKEN_TTL_MS,
    ...overrides,
  };
}

describe("name change email tokens", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret-for-name-change-tokens";
  });

  it("round-trips a signed payload", () => {
    const token = signNameChangeEmailToken(payload());
    const result = verifyNameChangeEmailToken(token);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.payload.client_id, "client-1");
      assert.equal(result.payload.action, "approve");
      assert.equal(result.payload.admin_email, "admin@example.com");
    }
  });

  it("rejects a tampered payload (approve flipped to reject)", () => {
    const token = signNameChangeEmailToken(payload());
    const [body, signature] = token.split(".") as [string, string];
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    decoded.action = "reject";
    const tampered = `${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${signature}`;
    const result = verifyNameChangeEmailToken(tampered);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "bad_signature");
  });

  it("rejects an expired token", () => {
    const token = signNameChangeEmailToken(payload({ exp: Date.now() - 1000 }));
    const result = verifyNameChangeEmailToken(token);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "expired");
  });

  it("rejects garbage tokens", () => {
    for (const bad of ["", "abc", "abc.", ".def", "not-a-token"]) {
      const result = verifyNameChangeEmailToken(bad);
      assert.equal(result.ok, false, `expected failure for ${JSON.stringify(bad)}`);
    }
  });

  it("tokens signed with a different secret fail verification", () => {
    const token = signNameChangeEmailToken(payload());
    process.env.CRON_SECRET = "a-completely-different-secret";
    const result = verifyNameChangeEmailToken(token);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "bad_signature");
  });
});
