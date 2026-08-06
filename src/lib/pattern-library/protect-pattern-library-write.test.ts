import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countFilledMeasurements,
  protectPatternLibraryWrite,
} from "@/lib/pattern-library/protect-pattern-library-write";

describe("protectPatternLibraryWrite", () => {
  it("counts filled measurement cells and remarks", () => {
    assert.equal(
      countFilledMeasurements([
        { base_value: 1, target_value: null, sewn_value: null, remarks: null },
        { base_value: null, target_value: null, sewn_value: null, remarks: "shorten" },
        { base_value: null, target_value: null, sewn_value: null, remarks: null },
      ]),
      2
    );
  });

  it("refuses wiping the whole client_patterns list", () => {
    assert.throws(
      () =>
        protectPatternLibraryWrite(
          {
            client_patterns: [{ id: "cp-1", versions: [] }],
          },
          { client_patterns: [] }
        ),
      /wipe pattern_library/
    );
  });

  it("keeps remote filled measurements when incoming trial is empty", () => {
    const remote = {
      client_patterns: [
        {
          id: "cp-1",
          versions: [
            {
              id: "v1",
              measurements: [
                { name: "Chest", target_value: 27.75, remarks: "pos 18" },
                { name: "Waist", target_value: 28.5, remarks: null },
              ],
            },
          ],
        },
      ],
    };
    const incoming = {
      updated_at: "2026-08-06T15:00:00.000Z",
      client_patterns: [
        {
          id: "cp-1",
          marker_fabric_width_cm: 148,
          versions: [
            {
              id: "v1",
              measurements: [
                { name: "Chest", target_value: null, remarks: null },
                { name: "Waist", target_value: null, remarks: null },
              ],
            },
          ],
        },
      ],
    };

    const merged = protectPatternLibraryWrite(remote, incoming);
    const version = merged.client_patterns![0]!.versions![0]!;
    assert.equal(countFilledMeasurements(version.measurements), 2);
    assert.equal(version.measurements![0]!.target_value, 27.75);
    assert.equal(version.measurements![0]!.remarks, "pos 18");
    assert.equal(merged.client_patterns![0]!.marker_fabric_width_cm, 148);
  });

  it("keeps remote patterns missing from a stale incoming payload", () => {
    const merged = protectPatternLibraryWrite(
      {
        client_patterns: [
          { id: "cp-old", versions: [] },
          { id: "cp-new", versions: [] },
        ],
      },
      {
        client_patterns: [{ id: "cp-new", versions: [] }],
      }
    );
    assert.deepEqual(
      merged.client_patterns!.map((pattern) => pattern.id).sort(),
      ["cp-new", "cp-old"]
    );
  });

  it("allows a real sheet save that still has filled values", () => {
    const remote = {
      client_patterns: [
        {
          id: "cp-1",
          versions: [
            {
              id: "v1",
              measurements: [{ name: "Chest", target_value: 20 }],
            },
          ],
        },
      ],
    };
    const incoming = {
      client_patterns: [
        {
          id: "cp-1",
          versions: [
            {
              id: "v1",
              measurements: [
                { name: "Chest", target_value: 27.75 },
                { name: "Waist", target_value: 28.5 },
              ],
            },
          ],
        },
      ],
    };
    const merged = protectPatternLibraryWrite(remote, incoming);
    assert.equal(
      countFilledMeasurements(merged.client_patterns![0]!.versions![0]!.measurements),
      2
    );
  });
});
