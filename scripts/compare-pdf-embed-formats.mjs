/**
 * Compare jsPDF image embed formats for D550 compatibility probing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createJiti } from "jiti";
import { jsPDF } from "jspdf";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const srcDir = resolve(projectRoot, "src");

const jiti = createJiti(import.meta.url, {
  alias: { "@": srcDir },
  interopDefault: true,
});

const { generateTestStickerPngs } = await jiti.import(
  resolve(srcDir, "lib/production/generate-sticker-pdf.ts")
);

const pngs = await generateTestStickerPngs({ rotationDeg: "printer-match", scalePct: 100 });
const png = pngs[0];

function inspectPdf(bytes, label) {
  const txt = bytes.toString("latin1");
  console.log(`\n=== ${label} ===`);
  console.log("size:", bytes.length);
  console.log("DCTDecode:", txt.includes("DCTDecode"));
  console.log("SMask:", txt.includes("/SMask"));
  console.log("Indexed:", txt.includes("Indexed"));
  console.log(
    "BitsPerComponent:",
    [...txt.matchAll(/\/BitsPerComponent\s+(\d+)/g)].map((m) => m[1])
  );
}

// Current: 1-bit bilevel PNG
{
  const doc = new jsPDF({ unit: "mm", format: [51, 102], orientation: "portrait" });
  doc.addImage(`data:image/png;base64,${png.toString("base64")}`, "PNG", 0, 0, 51, 102);
  const bytes = Buffer.from(doc.output("arraybuffer"));
  fs.writeFileSync(path.join(projectRoot, "compare-bilevel-png.pdf"), bytes);
  inspectPdf(bytes, "bilevel PNG (current)");
}

// JPEG embed
{
  const jpeg = await sharp(png).jpeg({ quality: 95, mozjpeg: true }).toBuffer();
  const doc = new jsPDF({ unit: "mm", format: [51, 102], orientation: "portrait" });
  doc.addImage(`data:image/jpeg;base64,${jpeg.toString("base64")}`, "JPEG", 0, 0, 51, 102);
  const bytes = Buffer.from(doc.output("arraybuffer"));
  fs.writeFileSync(path.join(projectRoot, "compare-jpeg.pdf"), bytes);
  inspectPdf(bytes, "JPEG");
}

// 8-bit RGB PNG (no palette)
{
  const png8 = await sharp(png).png({ palette: false, compressionLevel: 6 }).toBuffer();
  const doc = new jsPDF({ unit: "mm", format: [51, 102], orientation: "portrait" });
  doc.addImage(`data:image/png;base64,${png8.toString("base64")}`, "PNG", 0, 0, 51, 102);
  const bytes = Buffer.from(doc.output("arraybuffer"));
  fs.writeFileSync(path.join(projectRoot, "compare-8bit-png.pdf"), bytes);
  inspectPdf(bytes, "8-bit RGB PNG");
}
