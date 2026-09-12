import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyPayrollEmployeePatch } from "./payroll-employees.ts";
import type { PayrollEmployee } from "../types/hr-payroll.ts";

function employee(overrides: Partial<PayrollEmployee> = {}): PayrollEmployee {
  return {
    id: "2635574383",
    s_no: 32,
    employee_id_number: "2635574383",
    full_name: "A Tailor",
    short_name: "Tailor",
    bank_name: "Arab National Bank",
    account_number: "SA00",
    salary_amount: 4000,
    basic_salary: 3500,
    housing_allowance: 0,
    other_earnings: 500,
    deduction: 0,
    payment_description: "SALARY",
    address_1: "RIYADH",
    address_2: "RIYADH",
    address_3: "RIYADH",
    is_active: true,
    assigned_workstation_id: "PL-3-5",
    is_mobile_floater: true,
    job_functions: ["jacket_tailor", "cutter"],
    ...overrides,
  };
}

describe("applyPayrollEmployeePatch", () => {
  it("marks a leaver inactive", () => {
    const left = applyPayrollEmployeePatch(employee(), { is_active: false });
    assert.equal(left.is_active, false);
  });

  it("frees the workstation and clears the floater flag on the way out", () => {
    const left = applyPayrollEmployeePatch(employee(), { is_active: false });
    assert.equal(left.assigned_workstation_id, null, "a leaver must not hold a bench");
    assert.equal(left.is_mobile_floater, false);
  });

  it("keeps the payroll record intact so final settlement can still be run", () => {
    const left = applyPayrollEmployeePatch(employee(), { is_active: false });
    assert.equal(left.id, "2635574383");
    assert.equal(left.full_name, "A Tailor");
    assert.equal(left.salary_amount, 4000);
    assert.equal(left.bank_name, "Arab National Bank");
  });

  it("keeps job functions, which do nothing while inactive and matter on a rehire", () => {
    const left = applyPayrollEmployeePatch(employee(), { is_active: false });
    assert.deepEqual(left.job_functions, ["jacket_tailor", "cutter"]);
  });

  it("does not touch the workstation on an unrelated edit", () => {
    const renamed = applyPayrollEmployeePatch(employee(), { short_name: "Abu" });
    assert.equal(renamed.assigned_workstation_id, "PL-3-5");
    assert.equal(renamed.is_mobile_floater, true);
    assert.equal(renamed.is_active, true);
  });

  it("reinstates without handing back the old bench", () => {
    const left = applyPayrollEmployeePatch(employee(), { is_active: false });
    const back = applyPayrollEmployeePatch(left, { is_active: true });
    assert.equal(back.is_active, true);
    assert.equal(back.assigned_workstation_id, null, "HR reassigns a bench deliberately");
  });

  it("still applies an explicit workstation while active", () => {
    const moved = applyPayrollEmployeePatch(employee(), { assigned_workstation_id: "PL-1-1" });
    assert.equal(moved.assigned_workstation_id, "PL-1-1");
  });
});
