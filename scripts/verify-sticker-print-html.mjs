/**
 * Verify sticker direct-print HTML structure (landscape 102×51 for printer-match).
 * Usage: node scripts/verify-sticker-print-html.mjs
 */
import { createJiti } from "jiti";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const jiti = createJiti(import.meta.url, {
  alias: { "@": resolve(projectRoot, "src") },
  interopDefault: true,
});

const {
  buildStickerPrintHtml,
  browserPrintPageLayout,
  browserPrintNeedsLandscapeRotate,
  STICKER_PRINT_LANDSCAPE_H_MM,
  STICKER_PRINT_LANDSCAPE_W_MM,
} = jiti("@/lib/production/sticker-print-html");
const { PRINTER_MATCH_MODE } = jiti("@/lib/production/label-printer-settings");
const { STICKER_RASTER_DPI } = jiti("@/lib/production/render-sticker-raster");

const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
const html = buildStickerPrintHtml([dataUrl, dataUrl], { mode: PRINTER_MATCH_MODE });
const layout = browserPrintPageLayout(PRINTER_MATCH_MODE);
const imgWpx = Math.round((layout.pageW * STICKER_RASTER_DPI) / 25.4);
const imgHpx = Math.round((layout.pageH * STICKER_RASTER_DPI) / 25.4);

const checks = [
  [
    `@page landscape ${STICKER_PRINT_LANDSCAPE_W_MM}×${STICKER_PRINT_LANDSCAPE_H_MM}`,
    html.includes(`size: ${STICKER_PRINT_LANDSCAPE_W_MM}mm ${STICKER_PRINT_LANDSCAPE_H_MM}mm landscape`),
  ],
  ["margin: 0 in @page", html.includes("margin: 0")],
  ["two label pages", (html.match(/class="label-page"/g) ?? []).length === 2],
  [`img explicit px ${imgWpx}×${imgHpx}`, html.includes(`width="${imgWpx}" height="${imgHpx}"`)],
  [`img explicit mm ${layout.pageW}`, html.includes(`width: ${layout.pageW}mm`)],
  ["page-break-after on pages", html.includes("page-break-after: always")],
  ["inline data URL src", html.includes('src="data:image/png;base64,')],
  ["print-color-adjust exact", html.includes("print-color-adjust: exact")],
  ["no document title (avoids print header)", !html.includes("<title>")],
  ["printer-match needs landscape rotate", browserPrintNeedsLandscapeRotate(PRINTER_MATCH_MODE)],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(ok ? "OK" : "FAIL", label);
  if (!ok) failed = true;
}

if (failed) {
  process.exitCode = 1;
  console.error("Sticker print HTML verification failed.");
} else {
  console.log("Sticker print HTML structure verified.");
}
