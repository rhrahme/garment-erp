/**
 * Proof: PRODUCTION (cutting/sewing) sticker for SO-2026-0119 goes through the SAME shared render
 * as the Preparation label. Renders the emitted landscape bytes + the physical (post-driver-90°CW)
 * upright appearance so we can confirm it prints upright, complete, with the smaller QR/text.
 */
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const srcDir = resolve(projectRoot, "src");
const jiti = createJiti(import.meta.url, { alias: { "@": srcDir }, interopDefault: true });

const { loadStickerPdfEntries } = await jiti.import(resolve(srcDir, "lib/production/sticker-sheet-data.ts"));
const { generateStickerRollPngs } = await jiti.import(resolve(srcDir, "lib/production/generate-sticker-pdf.ts"));

const orderId = "so-1783283492238"; // SO-2026-0119
const opts = { rotationDeg: "printer-match", scalePct: 100 };

// Prefer the dedicated Production/pieces sheet; if this SO has only single-piece garments (which
// reuse the prep QR), fall back to the prod entries inside the combined print-pack.
let loaded = await loadStickerPdfEntries(orderId, { sheet: "pieces" });
let entries = loaded?.entries ?? [];
let source = "pieces";
if (entries.length === 0) {
  const pack = await loadStickerPdfEntries(orderId, { sheet: "print-pack" });
  entries = (pack?.entries ?? []).filter((e) => e.role === "prod");
  loaded = pack;
  source = "print-pack (prod entries)";
}

console.log("SO:", loaded?.order.so_number, "· production entries:", entries.length, "· source:", source);
if (entries.length === 0) {
  console.error("No production/cutting labels on this order (single-piece garments reuse the prep QR).");
  process.exit(2);
}

const target = entries[0];
const l = target.label;
console.log(`proof PRODUCTION label: role=${target.role} · ${l.production_code} · ${l.garment_type}/${l.piece_name} · ${l.fabric_brand} / ${l.fabric_number}`);

const pngs = await generateStickerRollPngs(entries, opts);
const emittedPath = resolve(projectRoot, "proof-so-0119-production-emitted.png");
writeFileSync(emittedPath, pngs[0]);
const em = await sharp(pngs[0]).metadata();
console.log(`Emitted bytes (${em.width}x${em.height} landscape):`, emittedPath);

const physical = await sharp(pngs[0]).rotate(90, { background: "#ffffff" }).png().toBuffer();
const physicalPath = resolve(projectRoot, "proof-so-0119-production-physical.png");
writeFileSync(physicalPath, physical);
const mp = await sharp(physical).metadata();
console.log(`Physical appearance after driver 90° CW (${mp.width}x${mp.height} portrait):`, physicalPath);

const physicalBig = resolve(projectRoot, "proof-so-0119-production-physical-2x.png");
execFileSync("cp", [physicalPath, physicalBig]);
execFileSync("sips", ["-Z", "1200", physicalBig], { stdio: "ignore" });
console.log("Viewable 2x:", physicalBig);
