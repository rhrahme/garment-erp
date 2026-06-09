/**
 * Verify sticker PDF page sizes AND content orientation for each rotation setting.
 *
 * This standalone script mirrors the exact mapping logic in
 * src/lib/production/generate-sticker-pdf.ts (mapLayoutPoint, mapLayoutImageRect,
 * textAngleForRotation, imageRotationForLayout) plus the page-size swap from
 * label-printer-settings.ts, so the rendered PNGs reflect what the real generator
 * produces. A page is laid out in 100×50 landscape "layout space", then each
 * rotation maps it onto the correct physical page:
 *   - 0° / 180°  -> 100×50 landscape page
 *   - 90° / 270° -> 50×100 portrait page  (page dimensions actually swap)
 *
 * Usage: node scripts/test-label-rotations.mjs
 * Renders sticker-test-rotation-{0,90,180,270}.pdf and .png (via macOS `sips`).
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { jsPDF } from "jspdf";

// Physical roll label: 100 mm wide × 50 mm tall (landscape on the roll).
const LAYOUT_W = 100;
const LAYOUT_H = 50;

const QR = 46;
const PAD = 1;

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

function mapLayoutImageRect(x, y, w, h, rotation) {
  switch (rotation) {
    case 0:
      return { x, y, w, h };
    case 90:
      return { x: y, y: LAYOUT_W - x - w, w: h, h: w };
    case 180:
      return { x: LAYOUT_W - x - w, y: LAYOUT_H - y - h, w, h };
    case 270:
      return { x: LAYOUT_H - y - h, y: x, w: h, h: w };
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

function imageRotationForLayout(rotation) {
  switch (rotation) {
    case 0:
      return 0;
    case 90:
      return 270;
    case 180:
      return 180;
    case 270:
      return 90;
  }
}

function drawText(doc, text, layoutX, layoutY, rotation, align = "left") {
  const { x, y } = mapLayoutPoint(layoutX, layoutY, rotation);
  doc.text(text, x, y, { align, baseline: "middle", angle: textAngleForRotation(rotation) });
}

function createPdf(rotation) {
  const pageSize = labelPdfPageSizeMm(rotation);
  // Match generate-sticker-pdf.ts: always pass [LAYOUT_W, LAYOUT_H] + orientation,
  // jsPDF swaps the dimensions for portrait.
  const doc = new jsPDF({
    unit: "mm",
    format: [LAYOUT_W, LAYOUT_H],
    orientation: labelPdfOrientation(rotation),
    compress: false,
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const EPS = 0.01;
  if (Math.abs(pageW - pageSize.width) > EPS || Math.abs(pageH - pageSize.height) > EPS) {
    throw new Error(
      `${rotation}°: expected ${pageSize.width}×${pageSize.height}, got ${pageW}×${pageH}`
    );
  }

  // --- QR placeholder on the LEFT of layout space, vertically centred ---
  const qrX = PAD;
  const qrY = PAD + (LAYOUT_H - PAD * 2 - QR) / 2;
  const r = mapLayoutImageRect(qrX, qrY, QR, QR, rotation);
  doc.setFillColor(225, 225, 225);
  doc.setDrawColor(0, 0, 0);
  doc.rect(r.x, r.y, r.w, r.h, "FD");
  // Asymmetric corner marker so rotation is visually obvious in the PNG.
  doc.setFillColor(0, 0, 0);
  const cornerLayout = mapLayoutImageRect(qrX, qrY, 8, 8, rotation);
  doc.rect(cornerLayout.x, cornerLayout.y, cornerLayout.w, cornerLayout.h, "F");
  doc.setTextColor(255, 255, 255);
  drawText(doc, "QR", qrX + 4, qrY + 4, rotation, "center");

  // --- Text block on the RIGHT of layout space, reads left-to-right at 0° ---
  doc.setTextColor(0, 0, 0);
  const textX = PAD + QR + 2;
  const lines = [
    ["PREPARATION", 11, 6],
    ["FR-0128-0019", 9, 14],
    ["Ralph Rahme", 9, 21],
    ["L01-SHT", 9, 28],
    ["Solbiati / S10008", 9, 35],
    ["0.9 m  1 label", 9, 42],
  ];
  for (const [text, fontPt, y] of lines) {
    doc.setFontSize(fontPt);
    drawText(doc, text, textX, y, rotation, "left");
  }

  return doc;
}

for (const rotationDeg of [0, 90, 180, 270]) {
  const doc = createPdf(rotationDeg);
  const bytes = Buffer.from(doc.output("arraybuffer"));
  const pdfText = bytes.toString("latin1");
  const mediaBox = pdfText.match(/\/MediaBox\s*\[([^\]]+)\]/);
  const pdfPath = `sticker-test-rotation-${rotationDeg}.pdf`;
  writeFileSync(pdfPath, bytes);

  const expected = labelPdfPageSizeMm(rotationDeg);
  const orientation = labelPdfOrientation(rotationDeg);

  // Rasterise the page to PNG so the orientation can be inspected visually.
  let pngNote = "(sips not run)";
  const pngPath = `sticker-test-rotation-${rotationDeg}.png`;
  try {
    execFileSync("sips", ["-s", "format", "png", pdfPath, "--out", pngPath], {
      stdio: "ignore",
    });
    pngNote = existsSync(pngPath) ? pngPath : "(png missing)";
  } catch (err) {
    pngNote = `(sips failed: ${err.message})`;
  }

  console.log(
    `${rotationDeg}° ${orientation}: page ${expected.width}×${expected.height} mm, ` +
      `MediaBox pt = [${mediaBox?.[1] ?? "?"}] -> ${pngNote}`
  );
}

console.log("\nInspect the PNGs:");
console.log("  0°  / 180° -> 100×50 landscape (wider than tall)");
console.log("  90° / 270° -> 50×100 portrait  (taller than wide)");
console.log("Content must read upright relative to the leading (feed) edge of the roll.");
