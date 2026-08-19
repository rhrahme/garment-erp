import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  entityRefsFromContext,
  fabricEntityKey,
  garmentEntityKey,
  isValidEntityKey,
  parseEntityKey,
  soLineEntityKey,
} from "@/lib/entity-images/keys";

describe("entity image keys", () => {
  it("normalizes fabric keys so the same cloth shares one album", () => {
    assert.equal(
      fabricEntityKey("Loro-Piana", "771011"),
      fabricEntityKey("loro-piana", " 771011 ")
    );
    assert.equal(fabricEntityKey("loro-piana", "771011"), "fabric:loro-piana::771011");
  });

  it("normalizes garment type keys", () => {
    assert.equal(garmentEntityKey("Shirt LS"), garmentEntityKey("shirt  ls"));
    assert.equal(garmentEntityKey("Trouser"), "garment:trouser");
  });

  it("accepts sales-order line ids", () => {
    assert.equal(soLineEntityKey("line-a"), "so_line:line-a");
    assert.equal(soLineEntityKey("not a key"), null);
  });

  it("rejects unknown keys", () => {
    assert.equal(isValidEntityKey("client:abc"), false);
    assert.equal(parseEntityKey("fabric:loro-piana::771011")?.kind, "fabric");
  });

  it("builds fabric + garment + article refs from a line", () => {
    const refs = entityRefsFromContext({
      supplierId: "loro-piana",
      fabricNumber: "771011",
      garmentType: "Shirt LS",
      salesOrderLineId: "line-1",
    });
    assert.deepEqual(
      refs.map((row) => row.kind),
      ["fabric", "garment", "so_line"]
    );
  });
});
