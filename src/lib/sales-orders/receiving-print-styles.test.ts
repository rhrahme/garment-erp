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

describe("RECEIVING_A4_PRINT_CSS — A4 shrink regression guards", () => {
  it("does not shrink the print sheet with transform:scale or zoom tricks", () => {
    // Allow "transform: none" / "zoom: 1" (explicit kill switches). Fail on scale()/zoom:<1.
    assert.doesNotMatch(RECEIVING_A4_PRINT_CSS, /transform\s*:\s*scale\s*\(/i);
    assert.doesNotMatch(RECEIVING_A4_PRINT_CSS, /zoom\s*:\s*0\./i);
    assert.doesNotMatch(RECEIVING_A4_PRINT_CSS, /zoom\s*:\s*[0-9]?[0-9]%/i);
    assert.match(RECEIVING_A4_PRINT_CSS, /transform:\s*none\s*!important/i);
    assert.match(RECEIVING_A4_PRINT_CSS, /zoom:\s*1\s*!important/i);
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
    assert.match(RECEIVING_A4_PRINT_CSS, /\.print-receiving-table img\s*\{[^}]*width:\s*1[4-9]mm/s);
  });

  it("keeps shell overflow visible so Chrome cannot tile columns across pages", () => {
    assert.match(RECEIVING_A4_PRINT_CSS, /overflow-x:\s*visible\s*!important/);
    assert.match(RECEIVING_A4_PRINT_CSS, /aside[\s\S]*display:\s*none\s*!important/);
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
  });
});
