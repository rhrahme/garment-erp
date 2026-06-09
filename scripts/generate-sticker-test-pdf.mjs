/**
 * Generate a local sticker test PDF and print MediaBox dimensions.
 * Usage: node scripts/generate-sticker-test-pdf.mjs [output.pdf]
 */
import { writeFileSync } from "node:fs";
import { jsPDF } from "jspdf";

const LAYOUT_W = 102;
const LAYOUT_H = 51;
const PDF_PAGE_W = 51;
const PDF_PAGE_H = 102;
const QR = 47;
const PAD = 1;
const GAP = 2;
const TEXT_ANGLE = -90;
const IMAGE_ROTATION = 270;

const outPath = process.argv[2] ?? "sticker-test-local.pdf";

function mapPoint(x, y) {
  return { x: y, y: PDF_PAGE_H - x };
}

function mapImageRect(x, y, w, h) {
  return { x: y, y: PDF_PAGE_H - x - w, w: h, h: w };
}

const doc = new jsPDF({
  unit: "mm",
  format: [LAYOUT_W, LAYOUT_H],
  orientation: "portrait",
  compress: false,
});

const pageW = doc.internal.pageSize.getWidth();
const pageH = doc.internal.pageSize.getHeight();
console.log("jsPDF internal page:", pageW, "×", pageH, "mm");

const qrX = PAD;
const qrY = PAD + (LAYOUT_H - PAD * 2 - QR) / 2;
const mappedQr = mapImageRect(qrX, qrY, QR, QR);
doc.setDrawColor(0, 0, 0);
doc.setFillColor(230, 230, 230);
doc.rect(mappedQr.x, mappedQr.y, mappedQr.w, mappedQr.h, "FD");
doc.setFontSize(8);
const qrCenter = mapPoint(qrX + QR / 2, qrY + QR / 2);
doc.text("QR", qrCenter.x, qrCenter.y, {
  align: "center",
  baseline: "middle",
  angle: TEXT_ANGLE,
});

const textX = PAD + QR + GAP;
const textW = LAYOUT_W - PAD * 2 - QR - GAP;
const lines = [
  ["PREPARATION", 12, PAD + 4],
  ["FR-0528-0029", 10, PAD + 11],
  ["Mokid Al Zahrani", 10, PAD + 18],
  ["FR-0101-L13", 10, PAD + 25],
  ["1.3 m · 1 label", 11, PAD + 32],
  ["PEGASO DELAVE 100% LINEN", 9, PAD + 39],
  ["Cut · Trouser", 10, PAD + 46],
];

for (const [text, fontSize, layoutY] of lines) {
  doc.setFontSize(fontSize);
  const point = mapPoint(textX, layoutY);
  doc.text(text, point.x, point.y, {
    align: "left",
    baseline: "middle",
    angle: TEXT_ANGLE,
    maxWidth: textW,
  });
}

const bytes = Buffer.from(doc.output("arraybuffer"));
writeFileSync(outPath, bytes);

const pdfText = bytes.toString("latin1");
const mediaBox = pdfText.match(/\/MediaBox\s*\[([^\]]+)\]/);
const rotate = pdfText.match(/\/Rotate\s+(\d+)/);
const hasText = pdfText.includes("PREPARATION") && pdfText.includes("Mokid");
console.log("Written:", outPath);
console.log("MediaBox (pt):", mediaBox?.[1] ?? "not found");
console.log("Rotate:", rotate?.[1] ?? "0");
console.log("Has visible text:", hasText);
console.log("Expected MediaBox pt: 0 0 144.57 289.13 (51×102 mm portrait)");
