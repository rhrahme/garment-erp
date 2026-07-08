/**
 * Extract embedded raster images (DCTDecode/JPEG, FlateDecode) from a jsPDF PDF
 * by scanning stream objects. Saves each image and reports dimensions + colorspace.
 * Usage: node scripts/extract-pdf-images.mjs <pdf> <outPrefix>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import sharp from "sharp";

const [pdfPath, outPrefix = "pdfimg"] = process.argv.slice(2);
const buf = readFileSync(pdfPath);
const latin = buf.toString("latin1");

// Find all "obj ... stream\r?\n ... endstream" with an image dictionary.
const objRe = /(\d+)\s+0\s+obj\s*<<([\s\S]*?)>>\s*stream\r?\n/g;
let m;
let count = 0;
const results = [];
while ((m = objRe.exec(latin)) !== null) {
  const dict = m[2];
  if (!/\/Subtype\s*\/Image/.test(dict)) continue;
  const streamStart = objRe.lastIndex;
  const endIdx = latin.indexOf("endstream", streamStart);
  if (endIdx < 0) continue;
  let dataEnd = endIdx;
  // strip trailing EOL before endstream
  const raw = buf.subarray(streamStart, dataEnd);
  const width = /\/Width\s+(\d+)/.exec(dict)?.[1];
  const height = /\/Height\s+(\d+)/.exec(dict)?.[1];
  const bpc = /\/BitsPerComponent\s+(\d+)/.exec(dict)?.[1];
  const filter = /\/Filter\s*\/(\w+)/.exec(dict)?.[1];
  const cs = /\/ColorSpace\s*\/?(\w+)/.exec(dict)?.[1];
  count += 1;
  const ext = filter === "DCTDecode" ? "jpg" : filter === "FlateDecode" ? "bin" : "raw";
  let outData = raw;
  if (filter === "FlateDecode") {
    try {
      outData = inflateSync(raw);
    } catch {
      /* leave raw */
    }
  }
  const outPath = `${outPrefix}-${count}.${ext}`;
  writeFileSync(outPath, outData);
  let meta = null;
  try {
    meta = await sharp(outPath).metadata();
  } catch {
    /* not directly readable (e.g. flate raw pixels) */
  }
  results.push({
    obj: m[1],
    dictWidth: width,
    dictHeight: height,
    bpc,
    filter,
    colorspace: cs,
    file: outPath,
    sharp: meta ? `${meta.width}x${meta.height} ${meta.format} ch=${meta.channels}` : "n/a",
    bytes: outData.length,
  });
}

console.log(`Found ${count} image XObject(s) in ${pdfPath}`);
for (const r of results) console.log(JSON.stringify(r));
