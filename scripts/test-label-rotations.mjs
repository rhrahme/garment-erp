/**
 * Verify sticker PDF page sizes for each rotation setting (standalone, no TS imports).
 * Usage: node scripts/test-label-rotations.mjs
 */
import { writeFileSync } from "node:fs";
import { jsPDF } from "jspdf";

const LAYOUT_W = 102;
const LAYOUT_H = 51;

function labelPdfOrientation(rotation) {
  return rotation === 90 || rotation === 270 ? "portrait" : "landscape";
}

function labelPdfPageSizeMm(rotation) {
  if (rotation === 90 || rotation === 270) {
    return { width: LAYOUT_H, height: LAYOUT_W };
  }
  return { width: LAYOUT_W, height: LAYOUT_H };
}

function mapLayoutPoint(x, y, rotation) {
  switch (rotation) {
    case 0:
      return { x, y };
    case 90:
      return { x: y, y: LAYOUT_W - x };
    case 180:
      return { x: LAYOUT_W - x, y: LAYOUT_H - y };
    case 270:
      return { x: LAYOUT_H - y, y: x };
  }
}

function textAngleForRotation(rotation) {
  switch (rotation) {
    case 0:
      return 0;
    case 90:
      return -90;
    case 180:
      return 180;
    case 270:
      return 90;
  }
}

function createPdf(rotation) {
  const pageSize = labelPdfPageSizeMm(rotation);
  const doc = new jsPDF({
    unit: "mm",
    format: [pageSize.width, pageSize.height],
    orientation: labelPdfOrientation(rotation),
    compress: false,
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  if (pageW !== pageSize.width || pageH !== pageSize.height) {
    throw new Error(
      `${rotation}°: expected ${pageSize.width}×${pageSize.height}, got ${pageW}×${pageH}`
    );
  }

  const point = mapLayoutPoint(10, 20, rotation);
  doc.setFontSize(10);
  doc.text("PREPARATION L01-SHT", point.x, point.y, {
    angle: textAngleForRotation(rotation),
    baseline: "middle",
  });

  return doc;
}

for (const rotationDeg of [0, 90, 180, 270]) {
  const doc = createPdf(rotationDeg);
  const bytes = Buffer.from(doc.output("arraybuffer"));
  const pdfText = bytes.toString("latin1");
  const mediaBox = pdfText.match(/\/MediaBox\s*\[([^\]]+)\]/);
  const hasText = pdfText.includes("PREPARATION") && pdfText.includes("L01-SHT");
  const outPath = `sticker-test-rotation-${rotationDeg}.pdf`;
  writeFileSync(outPath, bytes);
  const expected = labelPdfPageSizeMm(rotationDeg);
  console.log(
    `${rotationDeg}°: ${expected.width}×${expected.height} mm, MediaBox pt = ${mediaBox?.[1] ?? "?"}, content = ${hasText}`
  );
}

console.log("All rotation PDFs OK.");
