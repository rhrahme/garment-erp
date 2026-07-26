import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fabricNumberMatchesCatalogEntry } from "./fabric-catalog-number-match.ts";

describe("fabricNumberMatchesCatalogEntry", () => {
  it("matches exact numbers", () => {
    assert.equal(fabricNumberMatchesCatalogEntry("66046", "66046"), true);
  });

  it("matches Zegna-style numeric ranges", () => {
    assert.equal(fabricNumberMatchesCatalogEntry("66044", "66044-66046"), true);
    assert.equal(fabricNumberMatchesCatalogEntry("66046", "66044-66046"), true);
    assert.equal(fabricNumberMatchesCatalogEntry("66043", "66044-66046"), false);
  });
});
