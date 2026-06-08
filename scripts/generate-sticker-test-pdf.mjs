/**
 * Generate a local sticker test PDF and print MediaBox dimensions.
 * Usage: node scripts/generate-sticker-test-pdf.mjs [output.pdf]
 */
import { writeFileSync } from "node:fs";
import { jsPDF } from "jspdf";

const WIDTH = 102;
const HEIGHT = 51;
const PDF_PAGE_W = 51;
const PDF_PAGE_H = 102;
const QR = 45;
const PAD = 2;
const GAP = 3;

const outPath = process.argv[2] ?? "sticker-test-local.pdf";

const doc = new jsPDF({
  unit: "mm",
  format: [WIDTH, HEIGHT],
  orientation: "portrait",
  compress: false,
});

const pageW = doc.internal.pageSize.getWidth();
const pageH = doc.internal.pageSize.getHeight();
console.log("jsPDF internal page:", pageW, "×", pageH, "mm");

doc.saveGraphicsState();
doc.setCurrentTransformationMatrix([0, -1, 1, 0, 0, pageH]);

const qrX = PAD;
const qrY = PAD + (HEIGHT - PAD * 2 - QR) / 2;
doc.setDrawColor(0, 0, 0);
doc.setFillColor(230, 230, 230);
doc.rect(qrX, qrY, QR, QR, "FD");
doc.setFontSize(8);
doc.text("QR", qrX + QR / 2, qrY + QR / 2, { align: "center", baseline: "middle" });

const textX = PAD + QR + GAP;
const textW = WIDTH - PAD * 2 - QR - GAP;
doc.setFontSize(10);
doc.text("PREPARATION", textX, PAD + 4);
doc.setFontSize(8);
doc.text("FR-0528-0029", textX, PAD + 10);
doc.text("Mokid Al Zahrani", textX, PAD + 16);
doc.text("FR-0101-L13", textX, PAD + 22);
doc.text("1.3 m · 1 label", textX, PAD + 28);
doc.text("PEGASO DELAVE 100% LINEN", textX, PAD + 34, { maxWidth: textW });
doc.text("Cut · Trouser", textX, PAD + 40);

doc.restoreGraphicsState();

const bytes = Buffer.from(doc.output("arraybuffer"));
writeFileSync(outPath, bytes);

const pdfText = bytes.toString("latin1");
const mediaBox = pdfText.match(/\/MediaBox\s*\[([^\]]+)\]/);
const rotate = pdfText.match(/\/Rotate\s+(\d+)/);
console.log("Written:", outPath);
console.log("MediaBox (pt):", mediaBox?.[1] ?? "not found");
console.log("Rotate:", rotate?.[1] ?? "0");
console.log("Expected MediaBox pt: 0 0 144.57 289.13 (51×102 mm portrait)");
