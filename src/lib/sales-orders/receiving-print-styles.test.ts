import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { RECEIVING_A4_PRINT_CSS } from "@/lib/sales-orders/receiving-print-styles";

const here = dirname(fileURLToPath(import.meta.url));
const printPagePath = resolvePath(here, "../../app/(dashboard)/orders/[id]/print/page.tsx");
const printPackPath = resolvePath(here, "../../app/(dashboard)/orders/[id]/print-pack/page.tsx");

/** Extract first font-size declaration for a selector block (best-effort). */
function fontSizeFor(css: string, needle: string): number | null {
  const idx = css.indexOf(needle);
  if (idx < 0) return null;
  const slice = css.slice(idx, idx + 400);
  const match = slice.match(/font-size:\s*([\d.]+)pt/i);
  return match ? Number(match[1]) : null;
}

function pageMarginMm(css: string): number | null {
  const match = css.match(/@page\s*\{[^}]*margin:\s*([\d.]+)mm/i);
  return match ? Number(match[1]) : null;
}

describe("RECEIVING_A4_PRINT_CSS - A4 shrink regression guards (Chrome + Safari)", () => {
  it("uses portrait A4 with sensible margins (10-15mm)", () => {
    assert.match(RECEIVING_A4_PRINT_CSS, /@page\s*\{[^}]*size:\s*A4\s+portrait/i);
    assert.doesNotMatch(RECEIVING_A4_PRINT_CSS, /size:\s*A4\s+landscape/i);
    const margin = pageMarginMm(RECEIVING_A4_PRINT_CSS);
    assert.ok(margin != null && margin >= 10 && margin <= 15, `margin must be 10-15mm, got ${margin}`);
  });

  it("does not shrink the print sheet with transform:scale or zoom tricks", () => {
    assert.doesNotMatch(RECEIVING_A4_PRINT_CSS, /transform\s*:\s*scale\s*\(/i);
    assert.doesNotMatch(RECEIVING_A4_PRINT_CSS, /zoom\s*:\s*0\./i);
    assert.doesNotMatch(RECEIVING_A4_PRINT_CSS, /zoom\s*:\s*[0-9]?[0-9]%/i);
    // zoom is Chrome-oriented and Safari-unreliable - do not use it as a print control.
    assert.doesNotMatch(RECEIVING_A4_PRINT_CSS, /zoom\s*:/i);
    assert.match(RECEIVING_A4_PRINT_CSS, /transform:\s*none\s*!important/i);
  });

  it("forces full printable width (no max-width shrink trap)", () => {
    assert.match(RECEIVING_A4_PRINT_CSS, /\.print-a4-sheet\s*\{[^}]*max-width:\s*none\s*!important/s);
    assert.match(RECEIVING_A4_PRINT_CSS, /\.sales-order-print[\s\S]*?max-width:\s*none\s*!important/);
    assert.match(RECEIVING_A4_PRINT_CSS, /\.print-receiving-table\s*\{[^}]*width:\s*100%\s*!important/s);
    assert.match(RECEIVING_A4_PRINT_CSS, /table-layout:\s*fixed\s*!important/);
    // Explicitly neutralize the historical max-w-4xl + mx-auto trap (IMG_9922).
    assert.match(RECEIVING_A4_PRINT_CSS, /\.max-w-4xl/);
    assert.match(RECEIVING_A4_PRINT_CSS, /margin-left:\s*0\s*!important/);
  });

  it("keeps body table text floor-readable (>= 10pt) and QR large enough to scan", () => {
    const tdSize = fontSizeFor(RECEIVING_A4_PRINT_CSS, ".print-receiving-table td");
    const tableSize = fontSizeFor(RECEIVING_A4_PRINT_CSS, ".print-receiving-table {");
    assert.ok(tdSize != null && tdSize >= 10, `td font-size must be >= 10pt, got ${tdSize}`);
    assert.ok(tableSize != null && tableSize >= 10, `table font-size must be >= 10pt, got ${tableSize}`);
    assert.ok(tdSize != null && tdSize <= 12, `td font-size should stay ~10-12pt, got ${tdSize}`);
    assert.match(RECEIVING_A4_PRINT_CSS, /\.print-receiving-table img\s*\{[^}]*width:\s*1[2-8]mm/s);
  });

  it("keeps shell overflow visible so browsers cannot tile columns across pages", () => {
    assert.match(RECEIVING_A4_PRINT_CSS, /overflow-x:\s*visible\s*!important/);
    assert.match(RECEIVING_A4_PRINT_CSS, /aside[\s\S]*display:\s*none\s*!important/);
  });

  it("avoids avoid-page shrink on production sections (74ddfca regression)", () => {
    // Tall piece lists must paginate by row. avoid-page makes engines shrink-to-fit.
    const prodBlock = RECEIVING_A4_PRINT_CSS.match(/\.print-prod-section\s*\{[^}]*\}/);
    assert.ok(prodBlock, "missing .print-prod-section rules");
    assert.doesNotMatch(prodBlock![0], /avoid-page/i);
    assert.match(prodBlock![0], /page-break-inside:\s*auto/);
    // Fabric reference still starts on a new sheet (Safari needs page-break-before).
    assert.match(RECEIVING_A4_PRINT_CSS, /\.print-prod-fabric-section\s*\{[^}]*page-break-before:\s*always/s);
    assert.match(RECEIVING_A4_PRINT_CSS, /\.print-prod-fabric-section\s*\{[^}]*break-before:\s*page/s);
  });

  it("includes Safari print color / page-break parity hooks", () => {
    assert.match(RECEIVING_A4_PRINT_CSS, /-webkit-print-color-adjust:\s*exact/);
    assert.match(RECEIVING_A4_PRINT_CSS, /print-color-adjust:\s*exact/);
    assert.match(RECEIVING_A4_PRINT_CSS, /page-break-inside:\s*avoid/);
    assert.match(RECEIVING_A4_PRINT_CSS, /page-break-before:\s*always/);
  });

  it("production / print-pack pages do not reintroduce centered max-w-4xl shrink wrappers", () => {
    const printPage = readFileSync(printPagePath, "utf8");
    const printPack = readFileSync(printPackPath, "utf8");
    assert.match(printPage, /print-a4-sheet/);
    assert.match(printPack, /print-a4-sheet/);
    assert.doesNotMatch(printPage, /max-w-4xl/);
    assert.doesNotMatch(printPack, /max-w-4xl/);
    // Production must split QR list vs fabric reference (avoids 9-col horizontal tile).
    assert.match(printPage, /print-prod-fabric-section/);
    assert.match(printPage, /Fabric \/ composition reference/);
    // No Chrome-only zoom/scale hacks in the print page markup.
    assert.doesNotMatch(printPage, /transform:\s*scale|print:scale|zoom:\s*0/i);
  });
});
