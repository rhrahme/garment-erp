import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  badgeDisplayName,
  badgeGroupFromSlug,
  badgePdfHref,
  badgePrintDateLabel,
  badgePrintHref,
  chunkBadgePages,
  isBadgePrintableEmployee,
  listActiveBadgeEmployees,
  listBadgePrintableEmployees,
  parseBadgePrintIds,
  selectBadgePrintEmployees,
} from "@/lib/hr/badge-print";
import { toBadgeSafeEmployee } from "@/lib/data/payroll-employees";
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
  it("prefers short_name on badge label when set", () => {
    assert.equal(
      badgeDisplayName(emp({ id: "1", full_name: "Rone Astar Dhar Sutradhar", short_name: "Rone" })),
      "Rone"
    );
    assert.equal(
      badgeDisplayName(emp({ id: "2", full_name: "Legal Name Only", short_name: "   " })),
      "Legal Name Only"
    );
    assert.equal(
      badgeDisplayName(emp({ id: "3", full_name: "Legal Name Only", short_name: null })),
      "Legal Name Only"
    );
  });

  it("stamps print date as a version label", () => {
    assert.equal(badgePrintDateLabel(new Date("2026-08-01T12:00:00+03:00")), "Printed 01 Aug 2026");
    assert.match(badgePrintDateLabel(), /^Printed \d{2} [A-Z][a-z]{2} \d{4}$/);
  });

  it("keeps short_name on badge-safe employee shape", () => {
    const safe = toBadgeSafeEmployee(
      emp({ id: "E1", full_name: "Expat One", short_name: "One", bank_name: "Arab National Bank" })
    );
    assert.equal(safe.short_name, "One");
    assert.equal(safe.salary_amount, 0);
    assert.equal(safe.bank_name, "");
  });

  it("maps saudis/expats slugs", () => {
    assert.equal(badgeGroupFromSlug("saudis"), "saudi");
    assert.equal(badgeGroupFromSlug("expats"), "expat");
    assert.equal(badgeGroupFromSlug("other"), null);
  });

  it("builds print and pdf hrefs with optional ids", () => {
    assert.equal(badgePrintHref("saudi"), "/hr/id-badges/saudis/print");
    assert.equal(
      badgePrintHref("expat", ["E1", "E2"]),
      "/hr/id-badges/expats/print?ids=E1%2CE2"
    );
    assert.equal(badgePdfHref("saudi"), "/api/hr/id-badges/saudis/pdf");
    assert.equal(
      badgePdfHref("expat", ["E1", "E2"]),
      "/api/hr/id-badges/expats/pdf?ids=E1%2CE2"
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

  it("keeps badge-safe expats after bank_name is stripped", () => {
    const expat = emp({
      id: "E1",
      full_name: "Expat One",
      bank_name: "Arab National Bank",
    });
    const safe = toBadgeSafeEmployee(expat);
    assert.equal(safe.bank_name, "");
    // Re-classifying by bank would drop this employee from the Expat tab.
    assert.equal(listBadgePrintableEmployees([safe], "expat").length, 0);
    // Workspace path: group filter first, then strip, then active-only list.
    assert.deepEqual(
      listActiveBadgeEmployees([safe]).map((e) => e.id),
      ["E1"]
    );
  });
});
