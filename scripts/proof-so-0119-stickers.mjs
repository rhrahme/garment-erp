/**
 * Proof: generate the ACTUAL print artifact for SO-2026-0119 fabric-cut (prep) stickers
 * and render page 1 so it can be compared to the on-screen preview.
 * Usage: node scripts/proof-so-0119-stickers.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const srcDir = resolve(projectRoot, "src");

const jiti = createJiti(import.meta.url, { alias: { "@": srcDir }, interopDefault: true });

const { loadStickerPdfEntries } = await jiti.import(
  resolve(srcDir, "lib/production/sticker-sheet-data.ts")
);
const { generateStickerRollPdf, generateStickerRollPngs } = await jiti.import(
  resolve(srcDir, "lib/production/generate-sticker-pdf.ts")
);

const orderId = "so-1783283492238"; // SO-2026-0119
const loaded = await loadStickerPdfEntries(orderId, { sheet: "fabric-cuts" });
if (!loaded) {
  console.error("Order not found:", orderId);
  process.exit(1);
}
console.log("SO:", loaded.order.so_number, "· client:", loaded.order.client_name);
console.log("prep sticker entries:", loaded.entries.length);
console.log("label 1/…:", loaded.entries[0]?.label.production_code, loaded.entries[0]?.label.fabric_brand, "/", loaded.entries[0]?.label.fabric_number);

const opts = { rotationDeg: "printer-match", scalePct: 100 };

// 1) Full multi-page PDF (download fallback / archival) for all 37.
const pdfBytes = await generateStickerRollPdf(loaded.entries, opts);
const pdfPath = resolve(projectRoot, "proof-so-0119-fabric-cuts.pdf");
writeFileSync(pdfPath, Buffer.from(pdfBytes));
console.log("PDF:", pdfPath, `(${pdfBytes.length} bytes, ${loaded.entries.length} pages)`);

// 2) The exact bilevel PNG the HTML print popup embeds and prints 1:1 — this IS what reaches the D550.
const pngs = await generateStickerRollPngs(loaded.entries, opts);
const page1Path = resolve(projectRoot, "proof-so-0119-page1.png");
writeFileSync(page1Path, pngs[0]);
console.log("Print artifact page 1 (51x102 portrait bilevel):", page1Path);

// 3) Upscale for easy viewing (native raster is 203 DPI → small on screen).
const page1BigPath = resolve(projectRoot, "proof-so-0119-page1-2x.png");
execFileSync("cp", [page1Path, page1BigPath]);
execFileSync("sips", ["-Z", "1200", page1BigPath], { stdio: "ignore" });
console.log("Print artifact page 1 (viewable 2x):", page1BigPath);
