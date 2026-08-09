import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_STITCH_KIOSK_SETTINGS } from "../types/stitch-kiosk-settings.ts";

test("empty stitch kiosk settings start unpaused", () => {
  assert.equal(EMPTY_STITCH_KIOSK_SETTINGS.paused, false);
  assert.equal(EMPTY_STITCH_KIOSK_SETTINGS.paused_at, null);
  assert.equal(EMPTY_STITCH_KIOSK_SETTINGS.paused_by, null);
});
