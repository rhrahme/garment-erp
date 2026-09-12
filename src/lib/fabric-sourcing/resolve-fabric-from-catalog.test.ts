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

  it("resolves a Drapers number typed with the mill's DP prefix", () => {
    const spaced = resolveFabricItemFromCatalog("drapers", "DP 12517");
    const tight = resolveFabricItemFromCatalog("drapers", "DP70145");
    const bare = resolveFabricItemFromCatalog("drapers", "12517");

    assert.equal(spaced.manual, false, "DP 12517 is 12517");
    assert.equal(tight.manual, false, "DP70145 is 70145");
    assert.equal(spaced.composition, bare.composition);
    assert.equal(spaced.unit_price, bare.unit_price);
  });

  it("keeps the DP prefix on the number itself", () => {
    // The stickers and the supplier PO already carry it as written.
    assert.equal(resolveFabricItemFromCatalog("drapers", "DP 12517").fabric_number, "DP 12517");
  });

  it("leaves an unknown number as a manual entry", () => {
    const item = resolveFabricItemFromCatalog("zegna", "99999999");

    assert.equal(item.manual, true);
    assert.equal(item.fabric_number, "99999999");
    assert.equal(item.composition, null);
  });
});

describe("resolveFabricItemFromCatalog - mill pattern codes", () => {
  it("resolves a Canclini cloth written with the mill's pattern code", () => {
    // The stock list files this cloth as "1422477-1" and records the mill's own
    // "C11422477-1" beside it. Orders get written with the mill's spelling, so
    // an exact-number lookup found nothing and the invoice printed blank.
    const pattern = resolveFabricItemFromCatalog("canclini", "C11422477-1");
    const bare = resolveFabricItemFromCatalog("canclini", "1422477-1");

    assert.equal(pattern.manual, false, "C11422477-1 is 1422477-1");
    assert.equal(pattern.composition, bare.composition);
    assert.equal(pattern.unit_price, bare.unit_price);
  });

  it("keeps the pattern code on the number itself", () => {
    // The stickers and the supplier PO already carry it as written.
    assert.equal(
      resolveFabricItemFromCatalog("canclini", "C11422477-1").fabric_number,
      "C11422477-1"
    );
  });

  it("leaves a contested pattern code to the row that owns the number", () => {
    // Two Canclini rows describe themselves as C11422487-1, at 5.30 and 5.23,
    // and one of them is also literally numbered C11422487-1. Choosing between
    // those prices is not a lookup's decision, so the pattern index drops the
    // code entirely and the row that owns the number outright is what answers.
    const item = resolveFabricItemFromCatalog("canclini", "C11422487-1");

    assert.equal(item.fabric_number, "C11422487-1");
    assert.equal(item.unit_price, 5.23, "the row actually numbered C11422487-1");
  });

  it("does not invent a pattern match for an unknown code", () => {
    const item = resolveFabricItemFromCatalog("canclini", "C19999999-1");

    assert.equal(item.manual, true);
    assert.equal(item.composition, null);
    assert.equal(item.unit_price, null);
  });
});
