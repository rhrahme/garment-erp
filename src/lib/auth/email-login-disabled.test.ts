import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isEmailLoginDisabled } from "./email-login-disabled.ts";

describe("isEmailLoginDisabled", () => {
  it("blocks Mohtajul's old pattern email", () => {
    assert.equal(isEmailLoginDisabled("hagan.dp1@gmail.com"), true);
    assert.equal(isEmailLoginDisabled("  Hagan.DP1@gmail.com  "), true);
  });

  it("does not block badge or other emails", () => {
    assert.equal(isEmailLoginDisabled("badge-pattern-2625917972@badge.hagan.pro"), false);
    assert.equal(isEmailLoginDisabled("pattern@hagan.pro"), false);
    assert.equal(isEmailLoginDisabled(null), false);
  });
});
