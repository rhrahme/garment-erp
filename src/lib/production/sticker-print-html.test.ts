import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

// sticker-print-html.ts imports via the "@/" alias, so load it through jiti (same as the
// proof/render scripts) rather than the ad-hoc node test loader.
const srcDir = resolvePath(dirname(fileURLToPath(import.meta.url)), "../..");
const jiti = createJiti(import.meta.url, { alias: { "@": srcDir }, interopDefault: true });

const { buildStickerPrintHtml, browserPrintPageLayout } = await jiti.import(
  resolvePath(srcDir, "lib/production/sticker-print-html.ts")
);
const { PRINTER_MATCH_MODE } = await jiti.import(
  resolvePath(srcDir, "lib/production/label-printer-settings.ts")
);

const DATA_URL_A = "data:image/png;base64,AAAA";
const DATA_URL_B = "data:image/png;base64,BBBB";

describe("buildStickerPrintHtml", () => {
  it("prints at 51x102 mm portrait media with zero margins (no browser headers/footers)", () => {
    const html = buildStickerPrintHtml([DATA_URL_A], { mode: PRINTER_MATCH_MODE });
    // @page margin 0 → browser cannot add date/URL/page-number headers or shift content.
    assert.match(html, /@page\s*\{[^}]*margin:\s*0/);
    // Exact D550 media so the driver has nothing to "fit" (no shrink/rotation/offset).
    assert.match(html, /size:\s*51mm\s+102mm\s+portrait/);
  });

  it("embeds one full-page label-raster image per label, sized to fill the page", () => {
    const html = buildStickerPrintHtml([DATA_URL_A, DATA_URL_B], { mode: PRINTER_MATCH_MODE });
    const rasters = html.match(/class="label-raster"/g) ?? [];
    assert.equal(rasters.length, 2);
    assert.ok(html.includes(DATA_URL_A));
    assert.ok(html.includes(DATA_URL_B));
    // Image must fill the full page in mm so it maps 1:1 onto the media.
    assert.match(html, /width:\s*51mm/);
    assert.match(html, /height:\s*102mm/);
  });

  it("uses only inline data: image sources (never blob:) so print() never races image load", () => {
    const html = buildStickerPrintHtml([DATA_URL_A], { mode: PRINTER_MATCH_MODE });
    assert.ok(!html.includes("blob:"));
    assert.ok(html.includes("data:image/png"));
  });

  it("printer-match layout is portrait 51x102 (matches the D550 media, no landscape rotation)", () => {
    const layout = browserPrintPageLayout(PRINTER_MATCH_MODE);
    assert.equal(layout.pageW, 51);
    assert.equal(layout.pageH, 102);
    assert.equal(layout.landscape, false);
  });
});
