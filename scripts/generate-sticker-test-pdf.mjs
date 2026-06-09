/**
 * Generate a local 2-label sticker test PDF (102×51 mm landscape, one label per page).
 * Usage: node scripts/generate-sticker-test-pdf.mjs [output.pdf]
 */
import { writeFileSync } from "node:fs";
import { jsPDF } from "jspdf";

const PAGE_W = 102;
const PAGE_H = 51;
const QR = 47;
const PAD = 1;
const GAP = 2;

const outPath = process.argv[2] ?? "sticker-test-local.pdf";

function drawLabel(doc, fabricNumber, index) {
  if (index > 0) {
    doc.addPage([PAGE_W, PAGE_H], "landscape");
  }

  const qrX = PAD;
  const qrY = PAD + (PAGE_H - PAD * 2 - QR) / 2;
  doc.setDrawColor(0, 0, 0);
  doc.setFillColor(230, 230, 230);
  doc.rect(qrX, qrY, QR, QR, "FD");
  doc.setFontSize(8);
  doc.text("QR", qrX + QR / 2, qrY + QR / 2, { align: "center", baseline: "middle" });

  const textX = PAD + QR + GAP;
  const textW = PAGE_W - PAD * 2 - QR - GAP;
  const lines = [
    ["PREPARATION", 12, PAD + 4],
    ["FR-0128-0019", 10, PAD + 11],
    ["Ralph Rahme", 10, PAD + 18],
    ["L01-SHT", 10, PAD + 25],
    [`Solbiati / ${fabricNumber}`, 10, PAD + 32],
    ["0.9 m · 1 label", 11, PAD + 39],
    ["100% COTTON TEST", 9, PAD + 44],
  ];

  for (const [text, fontSize, y] of lines) {
    doc.setFontSize(fontSize);
    doc.text(text, textX, y, { align: "left", baseline: "middle", maxWidth: textW });
  }
}

const doc = new jsPDF({
  unit: "mm",
  format: [PAGE_W, PAGE_H],
  orientation: "landscape",
  compress: false,
});

const pageW = doc.internal.pageSize.getWidth();
const pageH = doc.internal.pageSize.getHeight();
console.log("jsPDF page 1:", pageW, "×", pageH, "mm");

drawLabel(doc, "S10008", 0);
drawLabel(doc, "S10009", 1);

const bytes = Buffer.from(doc.output("arraybuffer"));
writeFileSync(outPath, bytes);

const pdfText = bytes.toString("latin1");
const mediaBoxes = [...pdfText.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map((m) => m[1]);
const pageCount = (pdfText.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
const hasBoth = pdfText.includes("S10008") && pdfText.includes("S10009");

console.log("Written:", outPath);
console.log("Page count:", pageCount);
console.log("MediaBox per page (pt):", mediaBoxes.join(" | "));
console.log("Has S10008 + S10009:", hasBoth);
console.log("Expected: 2 pages, each MediaBox 0 0 289.13 144.57 (102×51 mm landscape)");

if (pageW !== PAGE_W || pageH !== PAGE_H) {
  process.exitCode = 1;
  console.error("FAIL: page 1 size mismatch");
} else if (pageCount !== 2) {
  process.exitCode = 1;
  console.error("FAIL: expected 2 pages");
} else if (mediaBoxes.length !== 2) {
  process.exitCode = 1;
  console.error("FAIL: expected 2 MediaBox entries");
} else {
  console.log("OK");
}
