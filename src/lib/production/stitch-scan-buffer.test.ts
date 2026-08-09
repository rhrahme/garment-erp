import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  looksLikePartialScanFragment,
  tryMergeScanFragments,
} from "@/lib/production/stitch-scan-buffer";

describe("looksLikePartialScanFragment", () => {
  it("flags short and prefix fragments from real floor failures", () => {
    assert.equal(looksLikePartialScanFragment("FR-0129"), true);
    assert.equal(looksLikePartialScanFragment("-L02-OS-1/2"), true);
    assert.equal(looksLikePartialScanFragment("EMP"), true);
    assert.equal(looksLikePartialScanFragment("EMP:"), true);
    assert.equal(looksLikePartialScanFragment("EMPALT"), true);
    assert.equal(looksLikePartialScanFragment("EMPALT:"), true);
    assert.equal(looksLikePartialScanFragment("EMPA"), true);
    assert.equal(looksLikePartialScanFragment("EMPAL"), true);
    assert.equal(looksLikePartialScanFragment("EMPIRON"), true);
    assert.equal(looksLikePartialScanFragment("EMPIRON:"), true);
    assert.equal(looksLikePartialScanFragment("EMPI"), true);
    assert.equal(looksLikePartialScanFragment("EMPBTN"), true);
    assert.equal(looksLikePartialScanFragment("EMPBTN:"), true);
    assert.equal(looksLikePartialScanFragment("EMPB"), true);
    assert.equal(looksLikePartialScanFragment(":2613429014"), true);
    assert.equal(looksLikePartialScanFragment("s"), true);
  });

  it("accepts complete badge and piece codes", () => {
    assert.equal(looksLikePartialScanFragment("EMP:2631625072"), false);
    assert.equal(looksLikePartialScanFragment("EMPALT:2631625072"), false);
    assert.equal(looksLikePartialScanFragment("EMPIRON:2543411918"), false);
    assert.equal(looksLikePartialScanFragment("EMPBTN:2543411918"), false);
    assert.equal(looksLikePartialScanFragment("FR-0129-L08-TR-2/2"), false);
    assert.equal(looksLikePartialScanFragment("FR-0132-L07-JKT-1/2"), false);
  });
});

describe("tryMergeScanFragments", () => {
  it("rejoins FR-0129 + -L02 piece splits", () => {
    assert.equal(
      tryMergeScanFragments("FR-0129", "-L02-OS-1/2"),
      "FR-0129-L02-OS-1/2"
    );
  });

  it("rejoins EMP badge splits", () => {
    assert.equal(tryMergeScanFragments("EMP", ":2613429014"), "EMP:2613429014");
    assert.equal(tryMergeScanFragments("EMP:", "2625917816"), "EMP:2625917816");
    assert.equal(tryMergeScanFragments("EMP", "2625917816"), "EMP:2625917816");
  });

  it("rejoins EMPALT alteration badge splits without collapsing to EMP", () => {
    assert.equal(
      tryMergeScanFragments("EMPALT", ":2613429014"),
      "EMPALT:2613429014"
    );
    assert.equal(
      tryMergeScanFragments("EMPALT:", "2625917816"),
      "EMPALT:2625917816"
    );
    assert.equal(
      tryMergeScanFragments("EMPALT", "2625917816"),
      "EMPALT:2625917816"
    );
    assert.equal(
      tryMergeScanFragments("EMPAL", "T:2613429014"),
      "EMPALT:2613429014"
    );
  });

  it("rejoins EMPIRON / EMPBTN dual-role badge splits without collapsing to EMP", () => {
    assert.equal(
      tryMergeScanFragments("EMPIRON", ":2543411918"),
      "EMPIRON:2543411918"
    );
    assert.equal(
      tryMergeScanFragments("EMPIRON:", "2543411918"),
      "EMPIRON:2543411918"
    );
    assert.equal(
      tryMergeScanFragments("EMP", "IRON:2543411918"),
      "EMPIRON:2543411918"
    );
    assert.equal(
      tryMergeScanFragments("EMPBTN", ":2543411918"),
      "EMPBTN:2543411918"
    );
    assert.equal(
      tryMergeScanFragments("EMP", "BTN:2543411918"),
      "EMPBTN:2543411918"
    );
  });

  it("does not merge two complete codes", () => {
    assert.equal(
      tryMergeScanFragments("EMP:2631625072", "FR-0129-L08-TR-2/2"),
      null
    );
    assert.equal(
      tryMergeScanFragments("EMPALT:2631625072", "FR-0129-L08-TR-2/2"),
      null
    );
    assert.equal(
      tryMergeScanFragments("EMPIRON:2543411918", "FR-0129-L08-TR-2/2"),
      null
    );
  });
});
