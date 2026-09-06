import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INVENTORY_BADGE_LOGIN_IDS,
  badgeLandingPath,
  badgeLoginEmail,
  badgeLoginEmployeeId,
  badgeLoginKindForEmployee,
  badgeLoginKindFromEmail,
  badgeSupabasePassword,
  hashBadgePassword,
  isBadgePatternLoginEmail,
  isBadgeQcLoginEmail,
  patternActorLabel,
  patternBadgeIdForEmail,
  patternEmailForBadgeId,
  verifyBadgePassword,
} from "./badge-login";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";
import {
  isClientManagerEmail,
  isInventoryClerkEmail,
  isPatternOperatorEmail,
  isPriceRestrictedAccess,
} from "./permissions";

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

  it("encodes QC in a separate email so they get client_manager, not pattern", () => {
    const email = badgeLoginEmail("2587734852", "qc");
    assert.equal(email, "badge-qc-2587734852@badge.hagan.pro");
    assert.equal(badgeLoginEmployeeId(email), "2587734852");
    assert.equal(badgeLoginKindFromEmail(email), "qc");
    assert.equal(isBadgeQcLoginEmail(email), true);
    assert.equal(isBadgePatternLoginEmail(email), false);
    assert.equal(isPatternOperatorEmail(email), false);
    assert.equal(isInventoryClerkEmail(email), false);
    assert.equal(isClientManagerEmail(email), true);
    assert.equal(isPriceRestrictedAccess(null, email), true);
    assert.equal(badgeLandingPath("qc"), "/orders");
  });

  it("encodes inventory clerk in a separate email so they never get pattern access", () => {
    const email = badgeLoginEmail("2543411918", "inventory");
    assert.equal(email, "badge-inventory-2543411918@badge.hagan.pro");
    assert.equal(badgeLoginEmployeeId(email), "2543411918");
    assert.equal(badgeLoginKindFromEmail(email), "inventory");
    assert.equal(isBadgePatternLoginEmail(email), false);
    assert.equal(isPatternOperatorEmail(email), false);
    assert.equal(isInventoryClerkEmail(email), true);
    assert.equal(badgeLandingPath("inventory"), "/inventory");
    assert.ok((INVENTORY_BADGE_LOGIN_IDS as readonly string[]).includes("2543411918"));
  });

  it("labels badge and shared-email logins with the employee so admin can trace", () => {
    assert.equal(patternActorLabel("hagan.dp1@gmail.com"), "Mohtajul (2625917972)");
    assert.match(patternActorLabel(badgeLoginEmail("2625917972")), /\(2625917972\)$/);
    assert.equal(patternActorLabel("someone@hagan.pro"), "someone@hagan.pro");
  });

  it("maps Mohtajul's old email to his badge so the Email tab still signs him in", () => {
    assert.equal(patternBadgeIdForEmail("hagan.dp1@gmail.com"), "2625917972");
    assert.equal(patternBadgeIdForEmail("  Hagan.DP1@gmail.com  "), "2625917972");
    assert.equal(patternBadgeIdForEmail("badge-pattern-2625917972@badge.hagan.pro"), null);
    assert.equal(patternBadgeIdForEmail(null), null);
    assert.equal(patternEmailForBadgeId("2625917972"), "hagan.dp1@gmail.com");
    assert.equal(patternEmailForBadgeId("xx22"), null);
  });
});

function payrollFixture(overrides: Partial<PayrollEmployee> = {}): PayrollEmployee {
  return {
    id: "2587734852",
    s_no: 34,
    employee_id_number: "2587734852",
    full_name: "Mahmudul Hassan",
    bank_name: "",
    account_number: "",
    salary_amount: 0,
    basic_salary: 0,
    housing_allowance: 0,
    other_earnings: 0,
    deduction: 0,
    payment_description: "",
    address_1: "",
    address_2: "",
    address_3: "",
    is_active: true,
    job_functions: ["qc", "pattern"],
    ...overrides,
  };
}

describe("badge login kind from payroll job functions", () => {
  it("gives QC when job_functions include qc, even if pattern is also set", () => {
    assert.equal(badgeLoginKindForEmployee(payrollFixture()), "qc");
    assert.equal(
      badgeLoginKindForEmployee(payrollFixture({ job_functions: ["qc"] })),
      "qc"
    );
  });

  it("gives pattern only when qc is absent", () => {
    assert.equal(
      badgeLoginKindForEmployee(payrollFixture({ job_functions: ["pattern"] })),
      "pattern"
    );
  });

  it("refuses inactive employees", () => {
    assert.equal(badgeLoginKindForEmployee(payrollFixture({ is_active: false })), null);
  });

  it("keeps the inventory allowlist ahead of qc/pattern", () => {
    assert.equal(
      badgeLoginKindForEmployee(
        payrollFixture({
          id: "2543411918",
          employee_id_number: "2543411918",
          job_functions: ["qc", "pattern"],
        })
      ),
      "inventory"
    );
  });
});

describe("badge supabase password derivation", () => {
  it("is deterministic per employee and differs between employees", () => {
    assert.equal(badgeSupabasePassword("1"), badgeSupabasePassword("1"));
    assert.notEqual(badgeSupabasePassword("1"), badgeSupabasePassword("2"));
    assert.equal(badgeSupabasePassword("1").length, 64);
  });
});
