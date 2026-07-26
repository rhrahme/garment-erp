import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("drapers swatch index shape", () => {
  it("keeps remote swatch_square URLs for indexed fabrics with cached filenames", () => {
    const index = JSON.parse(
      readFileSync(join(process.cwd(), "src/data/suppliers/drapers-swatch-index.json"), "utf8")
    ) as {
      fabrics: Array<{
        fabric_number: string;
        swatch_filename?: string | null;
        swatch_square?: string | null;
      }>;
    };

    const dual = index.fabrics.filter((row) => row.swatch_filename && row.swatch_square);
    assert.ok(dual.length > 0, "expected fabrics with both local filename and remote square URL");
    for (const row of dual) {
      assert.match(row.swatch_square!, /drapersitaly\.it/, row.fabric_number);
    }
  });
});
