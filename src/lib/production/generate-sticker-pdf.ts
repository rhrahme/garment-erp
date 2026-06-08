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

function drawLeftLine(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number
): void {
  const line = fitText(doc, text, maxWidth);
  doc.text(line, x, y, { align: "left", baseline: "middle" });
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

async function drawStickerPage(
  doc: jsPDF,
  label: PrintableStickerLabel,
  role: StickerRole | undefined,
  qrCache: Map<string, string>
): Promise<void> {
  const pageW = LABEL_ROLL_WIDTH_MM;
  const pageH = LABEL_ROLL_HEIGHT_MM;
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
    qrData = await fetchQrDataUrl(label.qr_payload, 380);
    qrCache.set(label.qr_payload, qrData);
  }
  doc.addImage(qrData, "PNG", qrX, qrY, qrSize, qrSize);

  const gap = LABEL_STICKER_LINE_GAP_MM;
  const headerH = lineHeightMm(headerFontMm);
  const bodyH =
    headerH +
    gap +
    lines.reduce((sum, line) => sum + lineHeightMm(line.fontMm) + gap, 0) -
    gap;
  let y = padV + (contentH - bodyH) / 2 + headerH / 2;

  doc.setFontSize(mmToPt(headerFontMm));
  doc.text(STICKER_ROLE_LABEL[stickerRole], textX, y, { align: "left", baseline: "middle" });
  if (batchMark) {
    doc.text(batchMark, textX + textW, y, { align: "right", baseline: "middle" });
  }

  y += headerH / 2 + gap;
  for (const line of lines) {
    const lineH = lineHeightMm(line.fontMm);
    y += lineH / 2;
    doc.setFontSize(mmToPt(line.fontMm));
    drawLeftLine(doc, line.text, textX, y, textW);
    y += lineH / 2 + gap;
  }
}

export type StickerPdfEntry = {
  label: PrintableStickerLabel;
  role?: StickerRole;
};

/** Server-generated roll PDF — exact 100×50 mm pages, no browser headers/footers. */
export async function generateStickerRollPdf(entries: StickerPdfEntry[]): Promise<Uint8Array> {
  if (entries.length === 0) {
    throw new Error("No sticker labels to print.");
  }

  const doc = new jsPDF({
    unit: "mm",
    format: [LABEL_ROLL_WIDTH_MM, LABEL_ROLL_HEIGHT_MM],
    orientation: "landscape",
    compress: true,
  });

  const qrCache = new Map<string, string>();

  for (let index = 0; index < entries.length; index += 1) {
    if (index > 0) {
      doc.addPage([LABEL_ROLL_WIDTH_MM, LABEL_ROLL_HEIGHT_MM], "landscape");
    }
    await drawStickerPage(doc, entries[index]!.label, entries[index]!.role, qrCache);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

/** Single test label for printer calibration (settings → label printer test). */
export async function generateTestStickerPdf(): Promise<Uint8Array> {
  const testLabel: PrintableStickerLabel = {
    sticker_code: "TEST-L01-SHT",
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

  return generateStickerRollPdf([{ label: testLabel, role: "prep" }]);
}
