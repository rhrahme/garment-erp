import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  employeeAlterationQrPayload,
  employeeButtonsQrPayload,
  employeeIroningQrPayload,
  employeeQrPayload,
  employeeAllowsBadgeActivity,
  employeeUsesButtonsBadgePair,
  employeeUsesIronButtonsBadgePair,
  employeeUsesWashIronBadgePair,
  employeeWashingQrPayload,
  isAnyEmployeeBadgeQrPayload,
  isEmployeeAlterationQrPayload,
  isEmployeeButtonsQrPayload,
  isEmployeeIroningQrPayload,
  isEmployeeQrPayload,
  parseEmployeeAlterationQrPayload,
  parseEmployeeBadgeScan,
  parseEmployeeButtonsQrPayload,
  parseEmployeeIroningQrPayload,
  parseEmployeeQrPayload,
  parseEmployeeWashingQrPayload,
} from "@/lib/hr/employee-qr";

const employee = { id: "emp-1", employee_id_number: "12345" };

describe("employee QR payloads", () => {
  it("builds EMP / EMPALT / EMPIRON / EMPBTN / EMPWASH from the same id number", () => {
    assert.equal(employeeQrPayload(employee), "EMP:12345");
    assert.equal(employeeAlterationQrPayload(employee), "EMPALT:12345");
    assert.equal(employeeIroningQrPayload(employee), "EMPIRON:12345");
    assert.equal(employeeButtonsQrPayload(employee), "EMPBTN:12345");
    assert.equal(employeeWashingQrPayload(employee), "EMPWASH:12345");
  });

  it("falls back to internal id when id number is blank", () => {
    assert.equal(employeeQrPayload({ id: "emp-9", employee_id_number: "  " }), "EMP:emp-9");
    assert.equal(
      employeeAlterationQrPayload({ id: "emp-9", employee_id_number: "" }),
      "EMPALT:emp-9"
    );
  });
});

describe("parseEmployeeQrPayload", () => {
  it("parses EMP: and rejects longer EMP* prefixes", () => {
    assert.equal(parseEmployeeQrPayload("EMP:12345"), "12345");
    assert.equal(parseEmployeeQrPayload("emp:abc"), "ABC");
    assert.equal(parseEmployeeQrPayload("EMPALT:12345"), null);
    assert.equal(parseEmployeeQrPayload("EMPIRON:12345"), null);
    assert.equal(parseEmployeeQrPayload("EMPBTN:12345"), null);
    assert.equal(parseEmployeeQrPayload("EMPWASH:12345"), null);
    assert.equal(parseEmployeeQrPayload("EMP:"), null);
  });
});

describe("parseEmployeeAlterationQrPayload", () => {
  it("parses EMPALT: only", () => {
    assert.equal(parseEmployeeAlterationQrPayload("EMPALT:12345"), "12345");
    assert.equal(parseEmployeeAlterationQrPayload("empalt:xyz"), "XYZ");
    assert.equal(parseEmployeeAlterationQrPayload("EMP:12345"), null);
  });
});

describe("parseEmployeeIroningQrPayload / parseEmployeeButtonsQrPayload", () => {
  it("parses EMPIRON and EMPBTN", () => {
    assert.equal(parseEmployeeIroningQrPayload("EMPIRON:2543411918"), "2543411918");
    assert.equal(parseEmployeeButtonsQrPayload("EMPBTN:2543411918"), "2543411918");
    assert.equal(parseEmployeeWashingQrPayload("EMPWASH:2625918129"), "2625918129");
    assert.equal(parseEmployeeIroningQrPayload("EMP:2543411918"), null);
    assert.equal(parseEmployeeButtonsQrPayload("EMPALT:2543411918"), null);
  });
});

describe("parseEmployeeBadgeScan", () => {
  it("returns work_kind and activity for EMP / EMPALT / EMPIRON / EMPBTN", () => {
    assert.deepEqual(parseEmployeeBadgeScan("EMP:12345"), {
      value: "12345",
      work_kind: "first_make",
      activity_job_function: null,
    });
    assert.deepEqual(parseEmployeeBadgeScan("EMPALT:12345"), {
      value: "12345",
      work_kind: "alteration",
      activity_job_function: null,
    });
    assert.deepEqual(parseEmployeeBadgeScan("EMPIRON:12345"), {
      value: "12345",
      work_kind: "first_make",
      activity_job_function: "wash_iron",
    });
    assert.deepEqual(parseEmployeeBadgeScan("EMPBTN:12345"), {
      value: "12345",
      work_kind: "first_make",
      activity_job_function: "buttons",
    });
    assert.deepEqual(parseEmployeeBadgeScan("EMPWASH:12345"), {
      value: "12345",
      work_kind: "first_make",
      activity_job_function: "washing",
    });
    assert.equal(parseEmployeeBadgeScan("FR-0129-L01-OS-1/2"), null);
  });

  it("does not let EMP steal EMPIRON or EMPBTN", () => {
    assert.equal(parseEmployeeQrPayload("EMPIRON:1"), null);
    assert.equal(isEmployeeQrPayload("EMPIRON:1"), false);
    assert.equal(isEmployeeIroningQrPayload("EMPIRON:1"), true);
    assert.equal(isEmployeeButtonsQrPayload("EMPBTN:1"), true);
  });
});

describe("employeeUsesIronButtonsBadgePair", () => {
  it("requires wash_iron + buttons and no tailor role", () => {
    assert.equal(
      employeeUsesIronButtonsBadgePair({ job_functions: ["wash_iron", "buttons"] }),
      true
    );
    assert.equal(employeeUsesIronButtonsBadgePair({ job_functions: ["wash_iron"] }), false);
    assert.equal(employeeUsesWashIronBadgePair({ job_functions: ["wash_iron"] }), true);
    assert.equal(employeeUsesWashIronBadgePair({ job_functions: ["washing"] }), true);
    assert.equal(
      employeeUsesWashIronBadgePair({ job_functions: ["wash_iron", "buttons"] }),
      false
    );
    assert.equal(employeeAllowsBadgeActivity(["wash_iron"], "washing"), true);
    assert.equal(employeeAllowsBadgeActivity(["washing"], "wash_iron"), true);
    assert.equal(
      employeeUsesIronButtonsBadgePair({
        job_functions: ["wash_iron", "buttons", "shirt_tailor"],
      }),
      false
    );
    assert.equal(employeeUsesButtonsBadgePair({ job_functions: ["buttons"] }), true);
    assert.equal(
      employeeUsesButtonsBadgePair({ job_functions: ["wash_iron", "buttons"] }),
      false
    );
    assert.equal(employeeUsesButtonsBadgePair({ job_functions: ["wash_iron"] }), false);
    assert.equal(
      employeeUsesButtonsBadgePair({ job_functions: ["buttons", "shirt_tailor"] }),
      false
    );
  });
});

describe("badge QR detectors", () => {
  it("does not classify EMPALT / EMPIRON / EMPBTN as a normal EMP payload", () => {
    assert.equal(isEmployeeQrPayload("EMP:1"), true);
    assert.equal(isEmployeeQrPayload("EMPALT:1"), false);
    assert.equal(isEmployeeAlterationQrPayload("EMPALT:1"), true);
    assert.equal(isAnyEmployeeBadgeQrPayload("EMPALT:1"), true);
    assert.equal(isAnyEmployeeBadgeQrPayload("EMPIRON:1"), true);
    assert.equal(isAnyEmployeeBadgeQrPayload("EMPBTN:1"), true);
    assert.equal(isAnyEmployeeBadgeQrPayload("EMPWASH:1"), true);
    assert.equal(isAnyEmployeeBadgeQrPayload("EMP:1"), true);
  });
});
