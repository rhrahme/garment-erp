import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  badgeGroupFromSlug,
  badgePrintHref,
  chunkBadgePages,
  isBadgePrintableEmployee,
  listBadgePrintableEmployees,
  parseBadgePrintIds,
  selectBadgePrintEmployees,
} from "@/lib/hr/badge-print";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

function emp(partial: Partial<PayrollEmployee> & Pick<PayrollEmployee, "id" | "full_name">): PayrollEmployee {
  return {
    s_no: 1,
    employee_id_number: partial.id,
    bank_name: "AL RAJHI BANK",
    account_number: "",
    salary_amount: 0,
    basic_salary: 0,
    housing_allowance: 0,
    other_earnings: 0,
    deduction: 0,
    payment_description: "SALARY",
    address_1: "",
    address_2: "",
    address_3: "",
    is_active: true,
    ...partial,
  };
}

describe("badge-print helpers", () => {
  it("maps saudis/expats slugs", () => {
    assert.equal(badgeGroupFromSlug("saudis"), "saudi");
    assert.equal(badgeGroupFromSlug("expats"), "expat");
    assert.equal(badgeGroupFromSlug("other"), null);
  });

  it("builds print hrefs with optional ids", () => {
    assert.equal(badgePrintHref("saudi"), "/hr/id-badges/saudis/print");
    assert.equal(
      badgePrintHref("expat", ["E1", "E2"]),
      "/hr/id-badges/expats/print?ids=E1%2CE2"
    );
  });

  it("excludes inactive and terminated employees", () => {
    assert.equal(isBadgePrintableEmployee(emp({ id: "1", full_name: "A", is_active: false })), false);
    assert.equal(
      isBadgePrintableEmployee(
        emp({ id: "2", full_name: "B", is_terminated: true } as PayrollEmployee & {
          is_terminated: boolean;
        })
      ),
      false
    );
    assert.equal(isBadgePrintableEmployee(emp({ id: "3", full_name: "C" })), true);
  });

  it("filters group and selection", () => {
    const employees = [
      emp({ id: "S1", full_name: "Saudi One", bank_name: "AL RAJHI BANK" }),
      emp({ id: "E1", full_name: "Expat One", bank_name: "Banque Saudi Fransi" }),
      emp({ id: "S2", full_name: "Saudi Two", bank_name: "AL RAJHI BANK", is_active: false }),
    ];
    const saudis = listBadgePrintableEmployees(employees, "saudi");
    assert.deepEqual(
      saudis.map((e) => e.id),
      ["S1"]
    );
    assert.deepEqual(
      selectBadgePrintEmployees(employees, "expat", ["E1"]).map((e) => e.id),
      ["E1"]
    );
    assert.deepEqual(parseBadgePrintIds("a, b"), ["a", "b"]);
    assert.equal(parseBadgePrintIds(undefined), null);
    assert.equal(chunkBadgePages([1, 2, 3], 2).length, 2);
  });
});
