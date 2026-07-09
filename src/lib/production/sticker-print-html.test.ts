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
const { PRINTER_MATCH_MODE, labelPdfPageSizeMm, labelPdfOrientation } = await jiti.import(
  resolvePath(srcDir, "lib/production/label-printer-settings.ts")
);
const { renderStickerPagePng } = await jiti.import(
  resolvePath(srcDir, "lib/production/render-sticker-raster.ts")
);
const sharp = (await import("sharp")).default;

const DATA_URL_A = "data:image/png;base64,AAAA";
const DATA_URL_B = "data:image/png;base64,BBBB";

describe("buildStickerPrintHtml", () => {
  it("prints at 102x51 mm landscape media with zero margins (no browser headers/footers)", () => {
    const html = buildStickerPrintHtml([DATA_URL_A], { mode: PRINTER_MATCH_MODE });
    // @page margin 0 → browser cannot add date/URL/page-number headers or shift content.
    assert.match(html, /@page\s*\{[^}]*margin:\s*0/);
    // Landscape page: the readable design is pre-rotated 90° CCW so the D550's fixed 90° CW turn
    // lands it upright on the 51×102 portrait label (no clipping). MUST NOT be portrait here, or
    // the driver rotates the tall content sideways and clips everything after the QR (IMG_9251).
    assert.match(html, /size:\s*102mm\s+51mm\s+landscape/);
    assert.doesNotMatch(html, /size:\s*51mm\s+102mm\s+portrait/);
  });

  it("embeds one full-page label-raster image per label, sized to fill the page", () => {
    const html = buildStickerPrintHtml([DATA_URL_A, DATA_URL_B], { mode: PRINTER_MATCH_MODE });
    const rasters = html.match(/class="label-raster"/g) ?? [];
    assert.equal(rasters.length, 2);
    assert.ok(html.includes(DATA_URL_A));
    assert.ok(html.includes(DATA_URL_B));
    // Image must fill the full landscape page in mm so it maps 1:1 onto the media.
    assert.match(html, /width:\s*102mm/);
    assert.match(html, /height:\s*51mm/);
  });

  it("uses only inline data: image sources (never blob:) so print() never races image load", () => {
    const html = buildStickerPrintHtml([DATA_URL_A], { mode: PRINTER_MATCH_MODE });
    assert.ok(!html.includes("blob:"));
    assert.ok(html.includes("data:image/png"));
  });

  it("printer-match layout is landscape 102x51 (pre-rotated to cancel the D550's 90° CW turn)", () => {
    const layout = browserPrintPageLayout(PRINTER_MATCH_MODE);
    assert.equal(layout.pageW, 102);
    assert.equal(layout.pageH, 51);
    assert.equal(layout.landscape, true);
  });

  it("auto-prints after images decode without depending on the window load event", () => {
    const html = buildStickerPrintHtml([DATA_URL_A], { mode: PRINTER_MATCH_MODE });
    // Runs immediately (boot()) — must NOT gate auto-print on window "load", which does not
    // re-fire after document.write into an already-loaded popup.
    assert.ok(html.includes("boot();"));
    assert.ok(!/addEventListener\(\s*["']load["']\s*,\s*autoPrint/.test(html));
    // Waits for the label image(s) to decode before printing.
    assert.match(html, /\.decode\s*===\s*"function"|\.decode\(\)/);
    assert.match(html, /window\.print\(/);
  });

  it("exposes a manual print fallback wired to a visible button", () => {
    const html = buildStickerPrintHtml([DATA_URL_A], { mode: PRINTER_MATCH_MODE });
    assert.ok(html.includes("window.__printStickerLabels"));
    // The screen-only button calls the fallback (or window.print) on a real user gesture.
    assert.match(html, /onclick="[^"]*__printStickerLabels[^"]*"/);
    assert.match(html, /class="screen-only"/);
  });
});

describe("printer-match media orientation", () => {
  it("emits a landscape 102x51 PDF page (so the D550's 90° CW turn lands it upright)", () => {
    const size = labelPdfPageSizeMm(PRINTER_MATCH_MODE);
    assert.equal(size.width, 102);
    assert.equal(size.height, 51);
    assert.equal(labelPdfOrientation(PRINTER_MATCH_MODE), "landscape");
  });

  it("renders a LANDSCAPE bitmap (width > height) for printer-match", async () => {
    const label = {
      sticker_code: "0119-L01",
      fabric_line_id: "l1",
      client_code: "FR-0726-0039",
      client_name: "Test Client",
      production_code: "0119-L01",
      fabric_cut_code: "0119-L01",
      piece_name: "Shirt",
      fabric_number: "722037",
      garment_type: "Shirt",
      supplier_name: "Loro Piana",
      fabric_brand: "Loro Piana",
      composition: "100% COTTON",
      weight_gsm: null,
      cut_quantity: 1.5,
      cut_unit: "meters",
      labels_sent: 1,
      article_number: 1,
      sticker_index: 1,
      sticker_total: 37,
      qr_payload: "0119-L01",
    };
    const png = await renderStickerPagePng(label, "prep", new Map(), PRINTER_MATCH_MODE, 100);
    const meta = await sharp(png).metadata();
    // Landscape: the tall portrait design is pre-rotated so the emitted raster is wider than tall.
    assert.ok(
      (meta.width ?? 0) > (meta.height ?? 0),
      `expected landscape raster, got ${meta.width}x${meta.height}`
    );
    // ~2:1 aspect (102:51) within rounding.
    const ratio = (meta.width ?? 0) / (meta.height ?? 1);
    assert.ok(ratio > 1.8 && ratio < 2.2, `expected ~2:1 aspect, got ${ratio.toFixed(3)}`);
  });
});
