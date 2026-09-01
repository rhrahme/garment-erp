import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePayrollAdjustmentInput } from "./payroll-adjustments.ts";

test("overtime needs an amount; note is optional", () => {
  const row = resolvePayrollAdjustmentInput({
    employee_id: "emp-1",
    kind: "overtime",
    amount: "150",
    hours: "2",
    note: "",
  });
  assert.equal(row.kind, "overtime");
  assert.equal(row.amount, 150);
  assert.equal(row.hours, 2);
  assert.equal(row.note, "");
});

test("a mistake deduction requires a note next to the amount", () => {
  assert.throws(
    () =>
      resolvePayrollAdjustmentInput({
        employee_id: "emp-1",
        kind: "deduction",
        amount: 50,
        note: "",
      }),
    /mistake/
  );
  const row = resolvePayrollAdjustmentInput({
    employee_id: "emp-1",
    kind: "deduction",
    amount: 50,
    note: "Broken button run",
  });
  assert.equal(row.kind, "deduction");
  assert.equal(row.amount, 50);
  assert.equal(row.note, "Broken button run");
});
