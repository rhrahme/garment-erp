import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  badgeLoginEmail,
  badgeLoginEmployeeId,
  badgeSupabasePassword,
  hashBadgePassword,
  isBadgePatternLoginEmail,
  patternActorLabel,
  verifyBadgePassword,
} from "./badge-login";
import { isPatternOperatorEmail } from "./permissions";

describe("badge login password hashing", () => {
  it("verifies the correct password and rejects wrong ones", () => {
    const hash = hashBadgePassword("secret-1");
    assert.equal(verifyBadgePassword("secret-1", hash), true);
    assert.equal(verifyBadgePassword("secret-2", hash), false);
    assert.equal(verifyBadgePassword("secret-1", "garbage"), false);
  });

  it("salts hashes - same password twice gives different hashes", () => {
    assert.notEqual(hashBadgePassword("same"), hashBadgePassword("same"));
  });
});

describe("badge login synthetic emails", () => {
  it("round-trips the employee id", () => {
    const email = badgeLoginEmail("2625917972");
    assert.equal(email, "badge-pattern-2625917972@badge.hagan.pro");
    assert.equal(badgeLoginEmployeeId(email), "2625917972");
    assert.equal(isBadgePatternLoginEmail(email), true);
  });

  it("rejects non-badge emails", () => {
    assert.equal(badgeLoginEmployeeId("pattern@hagan.pro"), null);
    assert.equal(badgeLoginEmployeeId("badge-pattern-xx22@badge.hagan.pro"), "xx22");
    assert.equal(badgeLoginEmployeeId("badge-pattern-abc@evil.example.com"), null);
    assert.equal(badgeLoginEmployeeId(null), null);
  });

  it("is treated as a pattern operator even without a profile row (degraded fallback)", () => {
    assert.equal(isPatternOperatorEmail(badgeLoginEmail("123")), true);
    assert.equal(isPatternOperatorEmail(badgeLoginEmail("xx22")), true);
    assert.equal(isPatternOperatorEmail("badge-pattern-1@evil.example.com"), false);
  });

  it("labels badge and shared-email logins with the employee so admin can trace", () => {
    assert.equal(patternActorLabel("hagan.dp1@gmail.com"), "Mohtajul (2625917972)");
    assert.match(patternActorLabel(badgeLoginEmail("2625917972")), /\(2625917972\)$/);
    assert.equal(patternActorLabel("someone@hagan.pro"), "someone@hagan.pro");
  });
});

describe("badge supabase password derivation", () => {
  it("is deterministic per employee and differs between employees", () => {
    assert.equal(badgeSupabasePassword("1"), badgeSupabasePassword("1"));
    assert.notEqual(badgeSupabasePassword("1"), badgeSupabasePassword("2"));
    assert.equal(badgeSupabasePassword("1").length, 64);
  });
});
