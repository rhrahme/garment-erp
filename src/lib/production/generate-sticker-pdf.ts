import { jsPDF } from "jspdf";
import {
  LABEL_ROLL_HEIGHT_MM,
  LABEL_ROLL_WIDTH_MM,
  LABEL_STICKER_COLUMN_GAP_MM,
  LABEL_STICKER_LINE_GAP_MM,
  LABEL_STICKER_PADDING_H_MM,
  LABEL_STICKER_PADDING_V_MM,
  LABEL_STICKER_QR_SIZE_MM,
} from "@/lib/production/label-print-config";
import {
  DEFAULT_LABEL_ROTATION,
  labelPdfOrientation,
  labelPdfPageSizeMm,
  type LabelRotationDeg,
} from "@/lib/production/label-printer-settings";
import {
  formatStickerBatchMark,
  formatStickerCutLength,
  formatStickerLabelsSent,
  qrImageFetchUrl,
  resolveStickerRole,
  STICKER_ROLE_LABEL,
  type PrintableStickerLabel,
  type StickerRole,
} from "@/lib/production/qr-labels";

const STICKER_RGB = { r: 42, g: 42, b: 42 };
const LINE_HEIGHT_FACTOR = 1.15;
const LAYOUT_W = LABEL_ROLL_WIDTH_MM;
const LAYOUT_H = LABEL_ROLL_HEIGHT_MM;

/** jsPDF font size is in pt; sticker layout uses mm. */
function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

function lineHeightMm(fontMm: number): number {
  return fontMm * LINE_HEIGHT_FACTOR;
}

async function fetchQrDataUrl(payload: string, size = 380): Promise<string> {
  const res = await fetch(qrImageFetchUrl(payload, size));
  if (!res.ok) throw new Error("Failed to load QR code image.");
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && doc.getTextWidth(`${trimmed}…`) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function mapLayoutPoint(
  x: number,
  y: number,
  rotation: LabelRotationDeg
): { x: number; y: number } {
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

function mapLayoutImageRect(
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: LabelRotationDeg
): { x: number; y: number; w: number; h: number } {
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

function textAngleForRotation(rotation: LabelRotationDeg): number {
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

function imageRotationForLayout(rotation: LabelRotationDeg): number {
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

function drawStickerText(
  doc: jsPDF,
  text: string,
  layoutX: number,
  layoutY: number,
  rotation: LabelRotationDeg,
  options: { align?: "left" | "right" | "center"; maxWidth?: number } = {}
): void {
  const { x, y } = mapLayoutPoint(layoutX, layoutY, rotation);
  doc.text(text, x, y, {
    align: options.align ?? "left",
    baseline: "middle",
    angle: textAngleForRotation(rotation),
    maxWidth: options.maxWidth,
  });
}

function drawLeftLine(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  rotation: LabelRotationDeg
): void {
  const line = fitText(doc, text, maxWidth);
  drawStickerText(doc, line, x, y, rotation);
}

function formatWeight(weightGsm: number | null): string | null {
  if (weightGsm == null) return null;
  return `${weightGsm} gsm`;
}

function pieceLabel(label: PrintableStickerLabel): string {
  return label.production_code === label.fabric_cut_code
    ? `Cut · ${label.piece_name}`
    : label.piece_name;
}

function createStickerPdfDocument(rotation: LabelRotationDeg): jsPDF {
  const doc = new jsPDF({
    unit: "mm",
    format: [LAYOUT_W, LAYOUT_H],
    orientation: labelPdfOrientation(rotation),
    compress: true,
  });

  const expected = labelPdfPageSizeMm(rotation);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  if (pageW !== expected.width || pageH !== expected.height) {
    throw new Error(
      `Sticker PDF page must be ${expected.width}×${expected.height} mm at ${rotation}°, got ${pageW}×${pageH} mm.`
    );
  }

  return doc;
}

async function drawStickerPage(
  doc: jsPDF,
  label: PrintableStickerLabel,
  role: StickerRole | undefined,
  qrCache: Map<string, string>,
  rotation: LabelRotationDeg
): Promise<void> {
  const pageW = LAYOUT_W;
  const pageH = LAYOUT_H;
  const padH = LABEL_STICKER_PADDING_H_MM;
  const padV = LABEL_STICKER_PADDING_V_MM;
  const contentW = pageW - padH * 2;
  const contentH = pageH - padV * 2;
  const qrSize = LABEL_STICKER_QR_SIZE_MM;
  const textX = padH + qrSize + LABEL_STICKER_COLUMN_GAP_MM;
  const textW = contentW - qrSize - LABEL_STICKER_COLUMN_GAP_MM;
  const qrX = padH;
  const qrY = padV + (contentH - qrSize) / 2;

  doc.setTextColor(STICKER_RGB.r, STICKER_RGB.g, STICKER_RGB.b);
  doc.setFont("helvetica", "normal");

  const stickerRole = resolveStickerRole(label, role);
  const batchMark = formatStickerBatchMark(label);
  const fabricLine = `${label.fabric_brand} / ${label.fabric_number}`;
  const specLine = [label.composition, formatWeight(label.weight_gsm)].filter(Boolean).join(" / ");
  const cutLengthLine = formatStickerCutLength(label.cut_quantity, label.cut_unit);
  const labelsLine = formatStickerLabelsSent(label.labels_sent);

  const headerFontMm = 2.8;
  const lines: Array<{ text: string; fontMm: number }> = [
    { text: label.client_code, fontMm: 3.6 },
    { text: label.client_name, fontMm: 3.4 },
    { text: label.production_code, fontMm: 3.3 },
    { text: fabricLine, fontMm: 3.2 },
    { text: cutLengthLine, fontMm: 3.8 },
    { text: labelsLine, fontMm: 3.2 },
  ];
  if (specLine) lines.push({ text: specLine, fontMm: 3.0 });
  lines.push({ text: pieceLabel(label), fontMm: 3.2 });

  let qrData = qrCache.get(label.qr_payload);
  if (!qrData) {
    qrData = await fetchQrDataUrl(label.qr_payload, 450);
    qrCache.set(label.qr_payload, qrData);
  }

  const mapped = mapLayoutImageRect(qrX, qrY, qrSize, qrSize, rotation);
  doc.addImage(
    qrData,
    "PNG",
    mapped.x,
    mapped.y,
    mapped.w,
    mapped.h,
    undefined,
    undefined,
    imageRotationForLayout(rotation)
  );

  const gap = LABEL_STICKER_LINE_GAP_MM;
  const headerH = lineHeightMm(headerFontMm);
  const bodyH =
    headerH +
    gap +
    lines.reduce((sum, line) => sum + lineHeightMm(line.fontMm) + gap, 0) -
    gap;
  let y = padV + (contentH - bodyH) / 2 + headerH / 2;

  doc.setFontSize(mmToPt(headerFontMm));
  drawStickerText(doc, STICKER_ROLE_LABEL[stickerRole], textX, y, rotation, { align: "left" });
  if (batchMark) {
    drawStickerText(doc, batchMark, textX + textW, y, rotation, { align: "right" });
  }

  y += headerH / 2 + gap;
  for (const line of lines) {
    const lineH = lineHeightMm(line.fontMm);
    y += lineH / 2;
    doc.setFontSize(mmToPt(line.fontMm));
    drawLeftLine(doc, line.text, textX, y, textW, rotation);
    y += lineH / 2 + gap;
  }
}

export type StickerPdfEntry = {
  label: PrintableStickerLabel;
  role?: StickerRole;
};

export type StickerPdfOptions = {
  rotationDeg?: LabelRotationDeg;
};

/** Server-generated roll PDF — page size and mapping depend on rotation setting. */
export async function generateStickerRollPdf(
  entries: StickerPdfEntry[],
  options: StickerPdfOptions = {}
): Promise<Uint8Array> {
  if (entries.length === 0) {
    throw new Error("No sticker labels to print.");
  }

  const rotation = options.rotationDeg ?? DEFAULT_LABEL_ROTATION;
  const doc = createStickerPdfDocument(rotation);
  const qrCache = new Map<string, string>();

  for (let index = 0; index < entries.length; index += 1) {
    if (index > 0) {
      doc.addPage([LAYOUT_W, LAYOUT_H], labelPdfOrientation(rotation));
    }
    const entry = entries[index]!;
    await drawStickerPage(doc, entry.label, entry.role, qrCache, rotation);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

/** Single test label for printer calibration (labels/test). */
export async function generateTestStickerPdf(
  options: StickerPdfOptions = {}
): Promise<Uint8Array> {
  const testLabel: PrintableStickerLabel = {
    sticker_code: "TEST-L01-SHT",
    fabric_line_id: "test-line",
    production_code: "L01-SHT",
    fabric_cut_code: "L01-SHT",
    qr_payload: "L01-SHT",
    client_code: "FR-0126-0019",
    client_name: "Ralph Rahme",
    garment_type: "Shirt",
    piece_name: "Shirt",
    fabric_number: "S10009",
    supplier_name: "Solbiati",
    fabric_brand: "Solbiati",
    composition: "100% COTTON TEST",
    weight_gsm: 240,
    cut_quantity: 0.9,
    cut_unit: "meters",
    labels_sent: 1,
    article_number: 1,
    sticker_index: 1,
    sticker_total: 14,
  };

  return generateStickerRollPdf([{ label: testLabel, role: "prep" }], options);
}
