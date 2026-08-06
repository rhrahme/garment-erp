import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  employeeAlterationQrPayload,
  employeeQrPayload,
  isAnyEmployeeBadgeQrPayload,
  isEmployeeAlterationQrPayload,
  isEmployeeQrPayload,
  parseEmployeeAlterationQrPayload,
  parseEmployeeBadgeScan,
  parseEmployeeQrPayload,
} from "@/lib/hr/employee-qr";

const employee = { id: "emp-1", employee_id_number: "12345" };

describe("employee QR payloads", () => {
  it("builds EMP and EMPALT payloads from the same id number", () => {
    assert.equal(employeeQrPayload(employee), "EMP:12345");
    assert.equal(employeeAlterationQrPayload(employee), "EMPALT:12345");
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
  it("parses EMP: and rejects EMPALT:", () => {
    assert.equal(parseEmployeeQrPayload("EMP:12345"), "12345");
    assert.equal(parseEmployeeQrPayload("emp:abc"), "ABC");
    assert.equal(parseEmployeeQrPayload("EMPALT:12345"), null);
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

describe("parseEmployeeBadgeScan", () => {
  it("returns work_kind for EMP and EMPALT", () => {
    assert.deepEqual(parseEmployeeBadgeScan("EMP:12345"), {
      value: "12345",
      work_kind: "first_make",
    });
    assert.deepEqual(parseEmployeeBadgeScan("EMPALT:12345"), {
      value: "12345",
      work_kind: "alteration",
    });
    assert.equal(parseEmployeeBadgeScan("FR-0129-L01-OS-1/2"), null);
  });
});

describe("badge QR detectors", () => {
  it("does not classify EMPALT as a normal EMP payload", () => {
    assert.equal(isEmployeeQrPayload("EMP:1"), true);
    assert.equal(isEmployeeQrPayload("EMPALT:1"), false);
    assert.equal(isEmployeeAlterationQrPayload("EMPALT:1"), true);
    assert.equal(isAnyEmployeeBadgeQrPayload("EMPALT:1"), true);
    assert.equal(isAnyEmployeeBadgeQrPayload("EMP:1"), true);
  });
});
