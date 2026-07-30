import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Mirrors PayrollWorkspace showSalaries gate.
 * Same rule as fabric-spec eye: default visible; lock hides immediately
 * without waiting on hydrate or password cookies.
 */
function payrollShowSalaries(canViewSalaries: boolean, salariesVisible: boolean): boolean {
  return Boolean(canViewSalaries && salariesVisible);
}

describe("payroll salary eye toggle showSalaries", () => {
  it("admin default visible shows salaries", () => {
    assert.equal(payrollShowSalaries(true, true), true);
  });

  it("admin lock hides salaries", () => {
    assert.equal(payrollShowSalaries(true, false), false);
  });

  it("no access never sees salaries even if visible flag is true", () => {
    assert.equal(payrollShowSalaries(false, true), false);
  });
});
