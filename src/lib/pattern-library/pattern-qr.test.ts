import assert from "node:assert/strict";
import { test } from "node:test";
import {
  basePatternLabelCode,
  basePatternQrUrl,
  clientPatternLabelCode,
  clientPatternPath,
  clientPatternQrUrl,
} from "./pattern-qr.ts";

test("clientPatternQrUrl is a permanent deep link from the immutable id", () => {
  // Ajlan Mohamad Al Ajlan (FR-0626-0035) — Custom client pattern, no fabric link.
  const id = "cp-1784935127357-1";
  assert.equal(clientPatternPath(id), `/pattern/library/clients/${id}`);
  assert.equal(
    clientPatternQrUrl(id, "https://erp.hagan.pro"),
    `https://erp.hagan.pro/pattern/library/clients/${id}`
  );
  // Relabeling pattern_ref must not change the scanned payload.
  assert.equal(
    clientPatternQrUrl(id, "https://erp.hagan.pro"),
    clientPatternQrUrl(id, "https://erp.hagan.pro/")
  );
});

test("clientPatternLabelCode reuses the team pattern_ref for the printed caption", () => {
  assert.equal(
    clientPatternLabelCode({ pattern_ref: "SHORTS-LINEN-2XL" }),
    "SHORTS-LINEN-2XL"
  );
});

test("basePatternQrUrl / label stay stable for archived base patterns", () => {
  const id = "bp-example";
  assert.equal(
    basePatternQrUrl(id, "https://erp.hagan.pro"),
    `https://erp.hagan.pro/pattern/library/bases/${id}`
  );
  assert.equal(
    basePatternLabelCode({
      cut_family: "Suit Supply",
      garment_type: "jacket",
      house_brand_code: "FR",
      cut_variant: "Regular",
    }),
    "PAT-SS-JACKET-FR-REG"
  );
});
