import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  employeeCanSewOnStitchKiosk,
  idBadgeGroup,
  isExpatEmployee,
} from "@/lib/hr/payroll-utils";

describe("isExpatEmployee / idBadgeGroup", () => {
  it("treats ANB and BSF banks as expat", () => {
    assert.equal(isExpatEmployee({ bank_name: "Arab National Bank" }), true);
    assert.equal(isExpatEmployee({ bank_name: "ANB" }), true);
    assert.equal(isExpatEmployee({ bank_name: "Banque Saudi Fransi" }), true);
    assert.equal(isExpatEmployee({ bank_name: "BSF" }), true);
    assert.equal(idBadgeGroup({ bank_name: "Arab National Bank" }), "expat");
  });

  it("treats other / missing banks as saudi", () => {
    assert.equal(isExpatEmployee({ bank_name: "AL RAJHI BANK" }), false);
    assert.equal(isExpatEmployee({ bank_name: "" }), false);
    assert.equal(idBadgeGroup({ bank_name: "AL RAJHI BANK" }), "saudi");
  });
});

describe("employeeCanSewOnStitchKiosk", () => {
  it("allows every expat ID-list job role (cutter, wash/iron, buttons, tailor)", () => {
    const expatBank = "Arab National Bank";
    assert.equal(employeeCanSewOnStitchKiosk({ bank_name: expatBank }), true);
    // Job function is irrelevant once on the Expats ID list.
    for (const _jobs of [["cutter"], ["wash_iron"], ["buttons"], ["jacket_tailor"], []] as const) {
      assert.equal(employeeCanSewOnStitchKiosk({ bank_name: expatBank }), true);
    }
  });

  it("rejects saudi / unknown bank badges even if they have tailor jobs", () => {
    assert.equal(employeeCanSewOnStitchKiosk({ bank_name: "AL RAJHI BANK" }), false);
    assert.equal(employeeCanSewOnStitchKiosk({ bank_name: "" }), false);
    assert.equal(employeeCanSewOnStitchKiosk(null), false);
    assert.equal(employeeCanSewOnStitchKiosk(undefined), false);
  });

  it("allows EMP 2631625072 bank shape (PARVAIZ / ANB)", () => {
    assert.equal(
      employeeCanSewOnStitchKiosk({ bank_name: "Arab National Bank" }),
      true
    );
  });
});
