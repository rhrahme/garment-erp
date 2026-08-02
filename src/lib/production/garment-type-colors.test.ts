import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  garmentTypeColorClasses,
  normalizeGarmentTypeColorKey,
} from "@/lib/production/garment-type-colors";

describe("normalizeGarmentTypeColorKey", () => {
  it("maps main garment / article labels", () => {
    assert.equal(normalizeGarmentTypeColorKey("Overshirt"), "overshirt");
    assert.equal(normalizeGarmentTypeColorKey("Trouser"), "trouser");
    assert.equal(normalizeGarmentTypeColorKey("Trousers"), "trouser");
    assert.equal(normalizeGarmentTypeColorKey("Jacket"), "jacket");
    assert.equal(normalizeGarmentTypeColorKey("Shirt LS"), "shirt");
    assert.equal(normalizeGarmentTypeColorKey("Shirt SS"), "shirt");
    assert.equal(normalizeGarmentTypeColorKey("Vest"), "vest");
    assert.equal(normalizeGarmentTypeColorKey("Short"), "short");
    assert.equal(normalizeGarmentTypeColorKey("Shorts"), "short");
    assert.equal(normalizeGarmentTypeColorKey("Polo"), "polo");
    assert.equal(normalizeGarmentTypeColorKey("T-shirt"), "tshirt");
    assert.equal(normalizeGarmentTypeColorKey("Overcoat"), "overcoat");
    assert.equal(normalizeGarmentTypeColorKey("Formal Thobe"), "thobe");
    assert.equal(normalizeGarmentTypeColorKey("Suit"), "suit");
  });

  it("prefers specific piece tokens in combined types", () => {
    assert.equal(normalizeGarmentTypeColorKey("Overshirt+Trouser"), "overshirt");
    assert.equal(normalizeGarmentTypeColorKey("Thobe+Jacket"), "jacket");
    assert.equal(normalizeGarmentTypeColorKey("Suit"), "suit");
  });

  it("returns null for empty / unknown", () => {
    assert.equal(normalizeGarmentTypeColorKey(""), null);
    assert.equal(normalizeGarmentTypeColorKey(null), null);
    assert.equal(normalizeGarmentTypeColorKey("Fabric only"), null);
  });
});

describe("garmentTypeColorClasses", () => {
  it("returns stable pastel bg+text for main types", () => {
    const overshirt = garmentTypeColorClasses("Overshirt");
    assert.equal(overshirt.key, "overshirt");
    assert.match(overshirt.bg, /^bg-/);
    assert.match(overshirt.text, /^text-/);
    assert.ok(overshirt.chip.includes(overshirt.bg));

    const trouser = garmentTypeColorClasses("Trouser");
    assert.equal(trouser.key, "trouser");
    assert.notEqual(trouser.chip, overshirt.chip);

    const jacket = garmentTypeColorClasses("Jacket");
    assert.equal(jacket.key, "jacket");
  });

  it("falls back to slate for unknown", () => {
    const unknown = garmentTypeColorClasses("Mystery garment");
    assert.equal(unknown.key, "unknown");
    assert.equal(unknown.bg, "bg-slate-100");
    assert.equal(unknown.text, "text-slate-700");
  });
});
