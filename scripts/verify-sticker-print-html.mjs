/**
 * Verify sticker direct-print HTML structure (51×102 mm, one img per page).
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
  STICKER_PRINT_PAGE_H_MM,
  STICKER_PRINT_PAGE_W_MM,
} = jiti("@/lib/production/sticker-print-html");

const html = buildStickerPrintHtml(["blob:test-1", "blob:test-2"]);

const checks = [
  [`@page size: ${STICKER_PRINT_PAGE_W_MM}mm ${STICKER_PRINT_PAGE_H_MM}mm`, html.includes(`size: ${STICKER_PRINT_PAGE_W_MM}mm ${STICKER_PRINT_PAGE_H_MM}mm`)],
  ["margin: 0 in @page", html.includes("margin: 0")],
  ["two label pages", (html.match(/class="label-page"/g) ?? []).length === 2],
  ["img width/height 100%", html.includes('width="100%" height="100%"')],
  ["page-break-after on pages", html.includes("page-break-after: always")],
  ["object-fit fill on img", html.includes("object-fit: fill")],
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
