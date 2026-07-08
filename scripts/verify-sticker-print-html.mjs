/**
 * Verify sticker direct-print HTML structure (portrait 51×102 for printer-match,
 * matching the D550 media so the driver prints 1:1 with no rotation/offset).
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
  STICKER_PRINT_PORTRAIT_H_MM,
  STICKER_PRINT_PORTRAIT_W_MM,
} = jiti("@/lib/production/sticker-print-html");
const { PRINTER_MATCH_MODE } = jiti("@/lib/production/label-printer-settings");
const { STICKER_RASTER_DPI } = jiti("@/lib/production/label-print-config");

const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
const html = buildStickerPrintHtml([dataUrl, dataUrl], { mode: PRINTER_MATCH_MODE });
const layout = browserPrintPageLayout(PRINTER_MATCH_MODE);
const imgWpx = Math.round((layout.pageW * STICKER_RASTER_DPI) / 25.4);
const imgHpx = Math.round((layout.pageH * STICKER_RASTER_DPI) / 25.4);

const checks = [
  [
    `@page portrait ${STICKER_PRINT_PORTRAIT_W_MM}×${STICKER_PRINT_PORTRAIT_H_MM} (matches D550 media)`,
    html.includes(`size: ${STICKER_PRINT_PORTRAIT_W_MM}mm ${STICKER_PRINT_PORTRAIT_H_MM}mm portrait`),
  ],
  ["layout is portrait (not landscape)", layout.landscape === false],
  ["margin: 0 in @page", html.includes("margin: 0")],
  ["two label pages", (html.match(/class="label-page"/g) ?? []).length === 2],
  [`img explicit px ${imgWpx}×${imgHpx}`, html.includes(`width="${imgWpx}" height="${imgHpx}"`)],
  [`img explicit mm ${layout.pageW}`, html.includes(`width: ${layout.pageW}mm`)],
  ["page-break-after on pages", html.includes("page-break-after: always")],
  ["inline data URL src", html.includes('src="data:image/png;base64,')],
  ["label raster class on img", html.includes('class="label-raster"')],
  ["screen fallback button", html.includes('class="screen-only"')],
  ["popup auto-print script", html.includes("sticker-print-finished")],
  ["print-color-adjust exact", html.includes("print-color-adjust: exact")],
  ["no document title (avoids print header)", !html.includes("<title>")],
  ["printer-match no longer pre-rotates", browserPrintNeedsLandscapeRotate(PRINTER_MATCH_MODE) === false],
  ["object-fit contain (no QR stretch)", html.includes("object-fit: contain")],
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
