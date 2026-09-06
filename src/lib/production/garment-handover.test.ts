import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  garmentHandoverLabel,
  handoverProofSrc,
  isHandoverProofTarget,
  normalizeGarmentHandoverTo,
} from "@/lib/production/garment-handover";

describe("stitched garment handover", () => {
  it("accepts factory driver or client driver", () => {
    assert.deepEqual(normalizeGarmentHandoverTo("factory_driver"), {
      ok: true,
      value: "factory_driver",
    });
    assert.deepEqual(normalizeGarmentHandoverTo("client_driver"), {
      ok: true,
      value: "client_driver",
    });
    assert.equal(normalizeGarmentHandoverTo("").ok, false);
    assert.equal(normalizeGarmentHandoverTo("courier").ok, false);
  });

  it("labels who took the garment", () => {
    assert.equal(garmentHandoverLabel("factory_driver"), "Handed to factory driver");
    assert.equal(garmentHandoverLabel("client_driver"), "Handed to client driver");
    assert.equal(garmentHandoverLabel(null), null);
    assert.ok(!garmentHandoverLabel("factory_driver")?.includes("\uFFFD"));
  });

  it("builds a handover proof image URL", () => {
    assert.equal(isHandoverProofTarget("work_order"), true);
    assert.equal(isHandoverProofTarget("sample"), true);
    assert.equal(isHandoverProofTarget("other"), false);
    assert.equal(
      handoverProofSrc("sample", "crs-1", {
        id: "handover-proof-1",
        uploaded_at: "2026-09-06T00:00:00.000Z",
      }),
      "/api/handover-proof/sample/crs-1/handover-proof-1?v=2026-09-06T00%3A00%3A00.000Z"
    );
  });
});
