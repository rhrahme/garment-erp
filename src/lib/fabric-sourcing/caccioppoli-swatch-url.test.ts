import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { caccioppoliSwatchImageUrl } from "@/lib/fabric-sourcing/caccioppoli-swatch-url";

const here = dirname(fileURLToPath(import.meta.url));

describe("caccioppoliSwatchImageUrl", () => {
  it("builds a deterministic proxy path (print can set img src without batch lookup)", () => {
    assert.equal(caccioppoliSwatchImageUrl("360102"), "/api/suppliers/caccioppoli/images/360102");
    assert.equal(caccioppoliSwatchImageUrl("360 102"), "/api/suppliers/caccioppoli/images/360102");
  });

  it("resolveFabricSwatchUrls falls back to the proxy URL for Caccioppoli", () => {
    const source = readFileSync(resolvePath(here, "fabric-swatch-keys.ts"), "utf8");
    assert.match(source, /provisionalCaccioppoliSwatchUrls/);
    assert.match(source, /caccioppoliMap\.get\(trimmed\) \?\? provisionalCaccioppoliSwatchUrls/);
  });
});
