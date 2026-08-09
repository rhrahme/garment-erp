import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BADGE_QR_ALT_LABEL,
  BADGE_QR_BUTTONS_LABEL,
  BADGE_QR_DISPLAY_MM,
  BADGE_QR_GAP_MM,
  BADGE_QR_IRON_LABEL,
  BADGE_QR_PAIR_WIDTH_MM,
  BADGE_QR_SEW_LABEL,
  badgeDisplayName,
  badgeGroupFromSlug,
  badgeJobFunctionLabels,
  badgeJobFunctionsLine,
  badgePdfHref,
  badgePrintDateLabel,
  badgePrintHref,
  badgeQrPairKind,
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
  it("keeps dual badge QRs large with a fixed 3cm clear gap and full labels", () => {
    assert.equal(BADGE_QR_DISPLAY_MM, 20);
    assert.equal(BADGE_QR_GAP_MM, 30);
    assert.equal(BADGE_QR_PAIR_WIDTH_MM, 70);
    assert.equal(BADGE_QR_SEW_LABEL, "SEWING");
    assert.equal(BADGE_QR_ALT_LABEL, "ALTERATION");
    assert.equal(BADGE_QR_IRON_LABEL, "IRONING");
    assert.equal(BADGE_QR_BUTTONS_LABEL, "BUTTONS");
  });

  it("prints IRONING/BUTTONS for wash_iron+buttons (Cherry), SEWING/ALTERATION otherwise", () => {
    assert.equal(
      badgeQrPairKind(
        emp({ id: "2543411918", full_name: "Cherry", job_functions: ["wash_iron", "buttons"] })
      ),
      "iron_buttons"
    );
    assert.equal(
      badgeQrPairKind(
        emp({ id: "2625918129", full_name: "Rohan", job_functions: ["wash_iron"] })
      ),
      "sew_alt"
    );
    assert.equal(
      badgeQrPairKind(
        emp({ id: "t1", full_name: "Tailor", job_functions: ["shirt_tailor"] })
      ),
      "sew_alt"
    );
  });

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

  it("formats job functions for the badge card and hides when empty", () => {
    assert.equal(badgeJobFunctionsLine(emp({ id: "1", full_name: "A" })), null);
    assert.equal(
      badgeJobFunctionsLine(emp({ id: "2", full_name: "B", job_functions: [] })),
      null
    );
    assert.deepEqual(
      badgeJobFunctionLabels(
        emp({ id: "3", full_name: "C", job_functions: ["qc", "shirt_tailor"] })
      ),
      ["Shirt tailor", "QC"]
    );
    assert.equal(
      badgeJobFunctionsLine(
        emp({ id: "4", full_name: "D", job_functions: ["qc", "shirt_tailor"] })
      ),
      "Shirt tailor, QC"
    );
    // Badge-safe strip must keep job_functions for print/PDF paths.
    const safe = toBadgeSafeEmployee(
      emp({
        id: "E1",
        full_name: "Expat One",
        bank_name: "Arab National Bank",
        job_functions: ["cutter", "qc"],
      })
    );
    assert.equal(badgeJobFunctionsLine(safe), "Cutter, QC");
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
