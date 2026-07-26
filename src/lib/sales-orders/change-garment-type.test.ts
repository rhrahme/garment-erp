import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canChangeGarmentType,
  garmentTypeChangeBlockedReason,
} from "./change-garment-type-rules.ts";

describe("canChangeGarmentType", () => {
  it("allows admin, QC, pattern, and factory manager", () => {
    assert.equal(canChangeGarmentType({ isAdmin: true, isClientManager: false, isPatternOperator: false, isProductionOperator: false }), true);
    assert.equal(canChangeGarmentType({ isAdmin: false, isClientManager: true, isPatternOperator: false, isProductionOperator: false }), true);
    assert.equal(canChangeGarmentType({ isAdmin: false, isClientManager: false, isPatternOperator: true, isProductionOperator: false }), true);
    assert.equal(canChangeGarmentType({ isAdmin: false, isClientManager: false, isPatternOperator: false, isProductionOperator: true }), true);
  });

  it("denies task and sales operators", () => {
    assert.equal(canChangeGarmentType({ isAdmin: false, isClientManager: false, isPatternOperator: false, isProductionOperator: false }), false);
  });
});

describe("garmentTypeChangeBlockedReason", () => {
  const openOrder = { status: "open" as const, retail_brand: null };

  it("allows change on open bespoke orders", () => {
    assert.equal(
      garmentTypeChangeBlockedReason(openOrder, { garment_type: "Overshirt" }, "Shirt LS"),
      null
    );
  });

  it("blocks same garment type", () => {
    assert.match(
      garmentTypeChangeBlockedReason(openOrder, { garment_type: "Shirt LS" }, "Shirt LS") ?? "",
      /already set/i
    );
  });

  it("blocks invalid garment type", () => {
    assert.match(
      garmentTypeChangeBlockedReason(openOrder, { garment_type: "Shirt LS" }, "Not A Type") ?? "",
      /Invalid garment type/i
    );
  });

  it("blocks ready-made retail orders", () => {
    assert.match(
      garmentTypeChangeBlockedReason(
        { status: "open", retail_brand: "Zara" },
        { garment_type: "Shirt LS" },
        "Overshirt"
      ) ?? "",
      /Ready-made/i
    );
  });

  it("blocks closed orders", () => {
    assert.match(
      garmentTypeChangeBlockedReason(
        { status: "completed", retail_brand: null },
        { garment_type: "Shirt LS" },
        "Overshirt"
      ) ?? "",
      /closed/i
    );
  });
});
