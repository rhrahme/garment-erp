import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAMERA_SAME_CODE_COOLDOWN_MS,
  cameraScanPayload,
  shouldAcceptCameraDecode,
} from "@/lib/production/stitch-camera-scan";

describe("stitch camera scan debounce", () => {
  it("accepts the first badge or wall QR", () => {
    assert.equal(cameraScanPayload("  EMP:2587734852  "), "EMP:2587734852");
    assert.equal(
      shouldAcceptCameraDecode({
        raw: "ATTEND",
        lastAccepted: null,
        lastAcceptedAt: 0,
        now: 1_000,
      }),
      true
    );
  });

  it("ignores the same QR held in the camera frame", () => {
    assert.equal(
      shouldAcceptCameraDecode({
        raw: "ATTEND",
        lastAccepted: "ATTEND",
        lastAcceptedAt: 1_000,
        now: 1_000 + CAMERA_SAME_CODE_COOLDOWN_MS - 1,
      }),
      false
    );
  });

  it("accepts badge then wall QR with no wait", () => {
    assert.equal(
      shouldAcceptCameraDecode({
        raw: "ATTEND",
        lastAccepted: "EMP:2587734852",
        lastAcceptedAt: 1_000,
        now: 1_050,
      }),
      true
    );
  });

  it("accepts the same QR again after the cooldown", () => {
    assert.equal(
      shouldAcceptCameraDecode({
        raw: "HAGAN-HERE",
        lastAccepted: "HAGAN-HERE",
        lastAcceptedAt: 1_000,
        now: 1_000 + CAMERA_SAME_CODE_COOLDOWN_MS,
      }),
      true
    );
  });

  it("rejects an empty frame", () => {
    assert.equal(
      shouldAcceptCameraDecode({
        raw: "   ",
        lastAccepted: null,
        lastAcceptedAt: 0,
        now: 1,
      }),
      false
    );
  });
});
