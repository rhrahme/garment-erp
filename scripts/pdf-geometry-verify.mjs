/**
 * Verify the PDF print path (what the new Print action prints):
 *  - each embedded page image is PORTRAIT ~408×815 (51×102mm @203dpi),
 *  - content is horizontally centered (left margin ≈ right margin),
 *  - QR still decodes from the lossy-JPEG-embedded image,
 *  - PDF MediaBox is 51×102 mm portrait.
 * Run scripts/pdf-proof.mjs first (writes /tmp/pdfproof-N.jpg + pdf-proof-fabric-cuts.pdf).
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const jsQR = require(resolve(__dirname, "vendor/jsQR.js"));

async function bbox(buf) {
  const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y += 1)
    for (let x = 0; x < info.width; x += 1)
      if (data[y * info.width + x] < 110) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
  return { minX, minY, maxX, maxY, w: info.width, h: info.height };
}

async function decode(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const r = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height);
  return r?.data ?? null;
}

// MediaBox check.
const pdf = readFileSync(resolve(projectRoot, "pdf-proof-fabric-cuts.pdf")).toString("latin1");
const mb = pdf.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
const ptToMm = (pt) => (pt * 25.4) / 72;
let mediaOk = false;
if (mb) {
  const wmm = ptToMm(parseFloat(mb[3]) - parseFloat(mb[1]));
  const hmm = ptToMm(parseFloat(mb[4]) - parseFloat(mb[2]));
  mediaOk = Math.abs(wmm - 51) < 0.5 && Math.abs(hmm - 102) < 0.5;
  console.log(`MediaBox = ${wmm.toFixed(2)}×${hmm.toFixed(2)} mm  portrait=${hmm > wmm}  ${mediaOk ? "OK" : "FAIL"}`);
} else {
  console.log("MediaBox not found  FAIL");
}

let allOk = mediaOk;
for (let i = 1; i <= 3; i += 1) {
  const buf = readFileSync(`/tmp/pdfproof-${i}.jpg`);
  const meta = await sharp(buf).metadata();
  const bb = await bbox(buf);
  const payload = await decode(buf);
  const leftM = bb.minX, rightM = meta.width - 1 - bb.maxX;
  const topM = bb.minY, bottomM = meta.height - 1 - bb.maxY;
  const portrait = meta.height > meta.width;
  const hCentered = Math.abs(leftM - rightM) <= Math.max(6, meta.width * 0.03);
  const noClip = leftM >= 1 && rightM >= 1 && topM >= 1 && bottomM >= 1;
  const ok = portrait && hCentered && noClip && !!payload;
  allOk = allOk && ok;
  console.log(
    `page ${i}: ${meta.width}x${meta.height} portrait=${portrait}  ` +
    `margins L/R=${leftM}/${rightM} T/B=${topM}/${bottomM}  hCentered=${hCentered} noClip=${noClip}  ` +
    `decode=${payload}  ${ok ? "OK" : "FAIL"}`
  );
}
process.exit(allOk ? 0 : 1);
