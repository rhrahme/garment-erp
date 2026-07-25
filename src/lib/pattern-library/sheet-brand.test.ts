import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSheetHouseBrand } from "./sheet-brand.ts";

test("resolveSheetHouseBrand prefers pattern house brand fields", () => {
  const brand = resolveSheetHouseBrand(
    {
      house_brand_code: "GL",
      house_brand_id: "gliani",
      client_code: "FR-0626-0035",
    },
    { house_brand_code: "FR", house_brand_id: "fouad-rahme" }
  );
  assert.equal(brand.code, "GL");
  assert.equal(brand.name, "Gliani");
});

test("resolveSheetHouseBrand falls back to base, then client-code prefix", () => {
  const fromBase = resolveSheetHouseBrand(
    { house_brand_code: null, house_brand_id: null, client_code: "FR-0626-0035" },
    { house_brand_code: "FR", house_brand_id: "fouad-rahme" }
  );
  assert.equal(fromBase.code, "FR");
  assert.equal(fromBase.name, "Fouad Rahme");

  const fromClient = resolveSheetHouseBrand(
    { house_brand_code: null, house_brand_id: null, client_code: "FR-0626-0035" },
    null
  );
  assert.equal(fromClient.code, "FR");
  assert.equal(fromClient.name, "Fouad Rahme");
});

test("resolveSheetHouseBrand returns empty when nothing resolves", () => {
  const brand = resolveSheetHouseBrand(
    { house_brand_code: null, house_brand_id: null, client_code: "CUSTOM" },
    null
  );
  assert.equal(brand.code, null);
  assert.equal(brand.name, null);
});
