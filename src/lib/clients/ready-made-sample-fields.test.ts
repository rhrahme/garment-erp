import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeSampleProductType,
  normalizeSamplePurpose,
  normalizeSampleReturnVia,
  samplePurposeLabel,
  sampleReturnViaLabel,
  validateSamplePhotoCount,
} from "@/lib/clients/ready-made-sample-fields";

describe("client sample garment fields", () => {
  it("requires a stitch garment type from the sales-order list", () => {
    assert.equal(normalizeSampleProductType("Trouser").ok, true);
    assert.equal(normalizeSampleProductType("Overcoat").ok, true);
    assert.equal(normalizeSampleProductType("Shirt LS").ok, true);
    assert.equal(normalizeSampleProductType("").ok, false);
    assert.equal(normalizeSampleProductType("random shirt").ok, false);
    const legacy = normalizeSampleProductType("old free text", { allowLegacy: true });
    assert.equal(legacy.ok, true);
    if (legacy.ok) assert.equal(legacy.value, "old free text");
  });

  it("requires Copy or Fix on a new sample", () => {
    assert.deepEqual(normalizeSamplePurpose("copy"), { ok: true, value: "copy" });
    assert.deepEqual(normalizeSamplePurpose("Fix"), { ok: true, value: "fix" });
    assert.equal(normalizeSamplePurpose("").ok, false);
    assert.equal(normalizeSamplePurpose("other").ok, false);
    assert.deepEqual(normalizeSamplePurpose("", { optional: true }), {
      ok: true,
      value: null,
    });
  });

  it("labels stored purpose values", () => {
    assert.equal(samplePurposeLabel("copy"), "Copy");
    assert.equal(samplePurposeLabel("fix"), "Fix");
    assert.equal(samplePurposeLabel(null), null);
  });

  it("records how the garment left: in person or a driver", () => {
    assert.deepEqual(normalizeSampleReturnVia("factory_driver"), {
      ok: true,
      value: "factory_driver",
    });
    assert.deepEqual(normalizeSampleReturnVia(""), { ok: true, value: "in_person" });
    assert.equal(sampleReturnViaLabel("factory_driver"), "Handed to factory driver");
    assert.equal(sampleReturnViaLabel("client_driver"), "Handed to client driver");
    assert.equal(sampleReturnViaLabel("in_person"), "Gave it back in person");
    assert.ok(!sampleReturnViaLabel("factory_driver")?.includes("\uFFFD"));
  });

  it("requires a receipt photo count on ERP create", () => {
    assert.equal(validateSamplePhotoCount(0, { required: true }).ok, false);
    assert.equal(validateSamplePhotoCount(2, { required: true }).ok, true);
    assert.equal(validateSamplePhotoCount(0, { required: false }).ok, true);
  });
});
