import { jsPDF } from "jspdf";
import {
  LABEL_ROLL_HEIGHT_MM,
  LABEL_ROLL_WIDTH_MM,
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
import { STICKER_PRINT_COLOR } from "@/lib/production/sticker-typography";

const STICKER_RGB = { r: 42, g: 42, b: 42 };

/** jsPDF font size is in pt; sticker CSS uses mm — convert for matching layout. */
function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

async function fetchQrDataUrl(payload: string, size = 140): Promise<string> {
  const res = await fetch(qrImageFetchUrl(payload, size));
  if (!res.ok) throw new Error("Failed to load QR code image.");
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function fitCenteredText(doc: jsPDF, text: string, centerX: number, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && doc.getTextWidth(`${trimmed}…`) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function drawCenteredLine(
  doc: jsPDF,
  text: string,
  centerX: number,
  y: number,
  maxWidth: number
): void {
  const line = fitCenteredText(doc, text, centerX, maxWidth);
  doc.text(line, centerX, y, { align: "center", baseline: "middle" });
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
  const contentW = pageW - LABEL_STICKER_PADDING_H_MM * 2;
  const centerX = pageW / 2;
  const maxTextW = contentW - 1;

  doc.setTextColor(STICKER_RGB.r, STICKER_RGB.g, STICKER_RGB.b);
  doc.setFont("helvetica", "normal");

  const stickerRole = resolveStickerRole(label, role);
  const batchMark = formatStickerBatchMark(label);
  const fabricLine = `${label.fabric_brand} / ${label.fabric_number}`;
  const specLine = [label.composition, formatWeight(label.weight_gsm)].filter(Boolean).join(" / ");
  const cutLengthLine = formatStickerCutLength(label.cut_quantity, label.cut_unit);
  const labelsLine = formatStickerLabelsSent(label.labels_sent);

  const lines: Array<{ text: string; fontMm: number }> = [
    { text: label.client_code, fontMm: 2.35 },
    { text: label.client_name, fontMm: 2.3 },
    { text: label.production_code, fontMm: 2.25 },
    { text: fabricLine, fontMm: 2.2 },
    { text: cutLengthLine, fontMm: 2.55 },
    { text: labelsLine, fontMm: 2.2 },
  ];
  if (specLine) lines.push({ text: specLine, fontMm: 2.05 });
  lines.push({ text: pieceLabel(label), fontMm: 2.2 });

  const qrRowH = LABEL_STICKER_QR_SIZE_MM;
  const lineHeights = lines.map((line) => mmToPt(line.fontMm) * 0.38);
  const gap = LABEL_STICKER_LINE_GAP_MM;
  const bodyH = qrRowH + gap + lineHeights.reduce((sum, h) => sum + h + gap, 0) - gap;
  const startY = (pageH - bodyH) / 2;

  const qrY = startY;
  const qrX = (pageW - LABEL_STICKER_QR_SIZE_MM) / 2;

  doc.setFontSize(mmToPt(2));
  const roleText = STICKER_ROLE_LABEL[stickerRole];
  const roleX = qrX - 1.5;
  doc.text(roleText, roleX, qrY + LABEL_STICKER_QR_SIZE_MM / 2, {
    align: "right",
    baseline: "middle",
  });

  if (batchMark) {
    doc.setFontSize(mmToPt(2.25));
    const batchX = qrX + LABEL_STICKER_QR_SIZE_MM + 1.5;
    doc.text(batchMark, batchX, qrY + LABEL_STICKER_QR_SIZE_MM / 2, {
      align: "left",
      baseline: "middle",
    });
  }

  let qrData = qrCache.get(label.qr_payload);
  if (!qrData) {
    qrData = await fetchQrDataUrl(label.qr_payload, 140);
    qrCache.set(label.qr_payload, qrData);
  }
  doc.addImage(qrData, "PNG", qrX, qrY, LABEL_STICKER_QR_SIZE_MM, LABEL_STICKER_QR_SIZE_MM);

  let y = qrY + qrRowH + gap;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    doc.setFontSize(mmToPt(line.fontMm));
    drawCenteredLine(doc, line.text, centerX, y + lineHeights[i]! / 2, maxTextW);
    y += lineHeights[i]! + gap;
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
