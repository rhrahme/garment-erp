import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveFabricItemFromCatalog } from "@/lib/fabric-sourcing/resolve-fabric-from-catalog";

describe("resolveFabricItemFromCatalog - catalog range rows", () => {
  it("resolves a number that only exists inside a range row", () => {
    // The Zegna price list stores 50021 to 50034 as one row. Nothing in the
    // catalog is literally called "50024", so an exact-only lookup returned a
    // blank manual entry and the cloth costed as if it had no price at all.
    const item = resolveFabricItemFromCatalog("zegna", "50024");

    assert.equal(item.manual, false, "the fabric is found in the catalog");
    assert.equal(item.weight_gsm, 260);
    assert.equal(item.unit_price, 137.3);
    assert.match(String(item.composition), /71% Wool/);
  });

  it("keeps the number that was entered, never the range", () => {
    const item = resolveFabricItemFromCatalog("zegna", "50024");

    // "50021-50034" is price-list shorthand. It must not reach a sticker, a
    // supplier PO or a customer invoice.
    assert.equal(item.fabric_number, "50024");
  });

  it("gives two fabrics from different ranges their own specs", () => {
    const wool = resolveFabricItemFromCatalog("zegna", "50024");
    const linen = resolveFabricItemFromCatalog("zegna", "66046");

    assert.notEqual(wool.weight_gsm, linen.weight_gsm, "260 gsm against 360 gsm");
    assert.notEqual(wool.composition, linen.composition);
    assert.equal(linen.weight_gsm, 360);
    assert.match(String(linen.composition), /100% Linen/);
  });

  it("still prefers an exact catalog row over a range containing it", () => {
    // 66044 is both the start of "66044-66046" and a real number. Whichever way
    // it is found, the entered number survives and the specs are the linen ones.
    const item = resolveFabricItemFromCatalog("zegna", "66044");

    assert.equal(item.fabric_number, "66044");
    assert.equal(item.weight_gsm, 360);
  });

  it("leaves an unknown number as a manual entry", () => {
    const item = resolveFabricItemFromCatalog("zegna", "99999999");

    assert.equal(item.manual, true);
    assert.equal(item.fabric_number, "99999999");
    assert.equal(item.composition, null);
  });
});
