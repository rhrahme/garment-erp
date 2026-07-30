import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listClientPatternTudVersions } from "@/lib/pattern-library/tud-versions";
import type { ClientPattern, PatternLibraryAttachment } from "@/lib/types/pattern-library";

function tud(id: string, uploadedAt: string): PatternLibraryAttachment {
  return {
    id,
    kind: "tud",
    filename: `${id}.tud`,
    stored_filename: `${id}.tud`,
    content_type: "application/octet-stream",
    size_bytes: 10,
    uploaded_at: uploadedAt,
    uploaded_by: "pattern@test.com",
  };
}

describe("listClientPatternTudVersions", () => {
  it("orders by upload time and marks latest active", () => {
    const pattern = {
      id: "cp",
      files: [tud("a", "2026-01-01T00:00:00.000Z"), tud("c", "2026-01-03T00:00:00.000Z")],
      versions: [
        {
          id: "v1",
          version: 1,
          is_final: false,
          trial_date: null,
          measurements: [],
          special_instructions: null,
          notes: null,
          files: [tud("b", "2026-01-02T00:00:00.000Z")],
          created_by: null,
          updated_by: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      active_tud_file_id: null,
    } as unknown as ClientPattern;

    const versions = listClientPatternTudVersions(pattern);
    assert.deepEqual(
      versions.map((v) => v.attachment.id),
      ["a", "b", "c"]
    );
    assert.equal(versions.find((v) => v.is_active)?.attachment.id, "c");
    assert.equal(versions[1]?.trial_version, 1);
  });

  it("honors explicit active_tud_file_id", () => {
    const pattern = {
      id: "cp",
      files: [tud("a", "2026-01-01T00:00:00.000Z"), tud("b", "2026-01-02T00:00:00.000Z")],
      versions: [],
      active_tud_file_id: "a",
    } as unknown as ClientPattern;
    const versions = listClientPatternTudVersions(pattern);
    assert.equal(versions.find((v) => v.is_active)?.attachment.id, "a");
  });
});
