import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PATTERN_HOWTO_A4_PRINT_CSS } from "@/lib/pattern/pattern-howto-print-styles";

const here = dirname(fileURLToPath(import.meta.url));
const printPagePath = resolvePath(here, "../../app/(print)/pattern/how-to/print/page.tsx");
const dashboardPrintPath = resolvePath(
  here,
  "../../app/(dashboard)/pattern/how-to/print/page.tsx"
);

describe("Pattern how-to A4 print", () => {
  it("uses portrait A4 with 12mm margins and no scale", () => {
    assert.match(PATTERN_HOWTO_A4_PRINT_CSS, /@page\s*\{[^}]*size:\s*A4\s+portrait/i);
    assert.match(PATTERN_HOWTO_A4_PRINT_CSS, /margin:\s*12mm/);
    assert.match(PATTERN_HOWTO_A4_PRINT_CSS, /html\s*\{[^}]*width:\s*100%\s*!important/s);
    assert.match(PATTERN_HOWTO_A4_PRINT_CSS, /body\s*\{[^}]*width:\s*100%\s*!important/s);
    assert.match(PATTERN_HOWTO_A4_PRINT_CSS, /transform:\s*none\s*!important/);
    assert.doesNotMatch(PATTERN_HOWTO_A4_PRINT_CSS, /transform\s*:\s*scale\s*\(/i);
    assert.doesNotMatch(PATTERN_HOWTO_A4_PRINT_CSS, /zoom\s*:/i);
    assert.match(PATTERN_HOWTO_A4_PRINT_CSS, /Helvetica,\s*Arial/);
    assert.match(PATTERN_HOWTO_A4_PRINT_CSS, /font-size:\s*11pt/);
    assert.match(PATTERN_HOWTO_A4_PRINT_CSS, /max-width:\s*none\s*!important/);
    assert.doesNotMatch(PATTERN_HOWTO_A4_PRINT_CSS, /break-inside:\s*avoid-page/);
  });

  it("lives under the bare print layout, not the dashboard shell", () => {
    assert.equal(existsSync(printPagePath), true);
    assert.equal(existsSync(dashboardPrintPath), false);
    const page = readFileSync(printPagePath, "utf8");
    assert.match(page, /PatternHowToPrintView/);
    assert.match(page, /canAccessPattern/);
  });
});
