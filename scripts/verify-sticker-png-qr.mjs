/**
 * Verify bilevel sticker PNG has solid QR modules (not hollow outlines).
 * Usage: node --import ./scripts/tsconfig-paths-loader.mjs scripts/verify-sticker-png-qr.mjs [orderId]
 */
import sharp from "sharp";
import { createJiti } from "jiti";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const orderId = process.argv[2] ?? "so-1780164354118";
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const jiti = createJiti(import.meta.url, {
  alias: { "@": resolve(projectRoot, "src") },
  interopDefault: true,
});

const { loadStickerPdfEntries } = jiti("@/lib/production/sticker-sheet-data");
const { generateStickerRollPngs } = jiti("@/lib/production/generate-sticker-pdf");

const loaded = await loadStickerPdfEntries(orderId, { sheet: "fabric-cuts" });
if (!loaded || loaded.entries.length === 0) {
  console.error("No sticker entries for", orderId);
  process.exit(1);
}

const pngs = await generateStickerRollPngs(loaded.entries.slice(0, 1));
const png = pngs[0];
const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });

let black = 0;
let white = 0;
let gray = 0;
for (let i = 0; i < data.length; i += info.channels) {
  const v = data[i];
  if (v < 32) black += 1;
  else if (v > 223) white += 1;
  else gray += 1;
}

const total = black + white + gray;
const bilevel = gray === 0;
const blackRatio = black / total;

console.log("Order:", orderId, "·", loaded.order.so_number);
console.log("Pixels:", { black, white, gray, bilevel, blackRatio: blackRatio.toFixed(4) });

if (!bilevel) {
  console.error("FAIL: PNG is not strict bilevel (gray pixels present)");
  process.exit(1);
}
if (blackRatio < 0.02 || blackRatio > 0.45) {
  console.error("FAIL: unexpected black ratio — QR may be hollow or missing");
  process.exit(1);
}

console.log("OK: bilevel PNG with solid QR modules");
process.exit(0);
