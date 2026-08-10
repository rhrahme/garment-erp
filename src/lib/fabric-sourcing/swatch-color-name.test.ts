import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nameColorFromRgb, rgbToHex } from "@/lib/fabric-sourcing/swatch-color-name";
import { resolveFabricDisplayColor } from "@/lib/fabric-sourcing/resolve-fabric-display-color";
import { loroPianaSwatchColorName } from "@/lib/fabric-sourcing/loro-piana-swatch-colors";

describe("nameColorFromRgb", () => {
  it("maps warm dark neutrals to Dark brown (not Charcoal)", () => {
    assert.equal(nameColorFromRgb({ r: 0x55, g: 0x3e, b: 0x39 }), "Dark brown");
    assert.equal(rgbToHex({ r: 0x55, g: 0x3e, b: 0x39 }), "#553e39");
  });

  it("keeps strong blues as Blue / Navy", () => {
    assert.equal(nameColorFromRgb({ r: 30, g: 45, b: 120 }), "Navy");
  });
});

describe("loroPianaSwatchColorName", () => {
  it("returns Dark brown for Khaled L26 fabric 771029", () => {
    assert.equal(loroPianaSwatchColorName("771029"), "Dark brown");
    assert.equal(
      resolveFabricDisplayColor({
        supplier_id: "loro-piana",
        fabric_number: "771029",
        color: null,
      }),
      "Dark brown"
    );
    assert.equal(
      resolveFabricDisplayColor({
        supplier_id: "loro-piana",
        fabric_number: "771029",
        color: "Custom Navy",
      }),
      "Custom Navy"
    );
  });
});
