import { jsPDF } from "jspdf";
import {
  LABEL_ROLL_HEIGHT_MM,
  LABEL_ROLL_WIDTH_MM,
  LABEL_STICKER_COLUMN_GAP_MM,
  LABEL_STICKER_FONT_MM,
  LABEL_STICKER_LINE_GAP_MM,
  LABEL_STICKER_PADDING_H_MM,
  LABEL_STICKER_PADDING_V_MM,
  LABEL_STICKER_QR_SIZE_MM,
} from "@/lib/production/label-print-config";
import {
  DEFAULT_LABEL_ROTATION,
  DEFAULT_LABEL_SCALE_PCT,
  labelPdfOrientation,
  labelPdfPageSizeMm,
  labelScaleMultiplier,
  type LabelRotationDeg,
  type LabelScalePct,
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

/**
 * Canonical design space = the UPRIGHT portrait label: 50 mm wide × 100 mm tall.
 * QR on top, horizontal text stacked below. Rotation 0° draws this directly
 * (identity mapping — no per-element rotation, no CTM tricks). 90°/180°/270°
 * rotate the same design onto the matching page for feed-direction edge cases.
 */
const DESIGN_W = LABEL_ROLL_WIDTH_MM; // 50
const DESIGN_H = LABEL_ROLL_HEIGHT_MM; // 100

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

/** Map a point from upright portrait design space onto the rotated page. */
function mapLayoutPoint(
  x: number,
  y: number,
  rotation: LabelRotationDeg
): { x: number; y: number } {
  switch (rotation) {
    case 0:
      return { x, y };
    case 90:
      return { x: DESIGN_H - y, y: x };
    case 180:
      return { x: DESIGN_W - x, y: DESIGN_H - y };
    case 270:
      return { x: y, y: DESIGN_W - x };
  }
}

/** Map an upright design-space rectangle (top-left + size) onto the rotated page. */
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
      return { x: DESIGN_H - y - h, y: x, w: h, h: w };
    case 180:
      return { x: DESIGN_W - x - w, y: DESIGN_H - y - h, w, h };
    case 270:
      return { x: y, y: DESIGN_W - x - w, w: h, h: w };
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
  options: { align?: "left" | "right" | "center" } = {}
): void {
  const { x, y } = mapLayoutPoint(layoutX, layoutY, rotation);
  doc.text(text, x, y, {
    align: options.align ?? "left",
    baseline: "middle",
    angle: textAngleForRotation(rotation),
  });
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
  const pageSize = labelPdfPageSizeMm(rotation);
  const doc = new jsPDF({
    unit: "mm",
    format: [pageSize.width, pageSize.height],
    orientation: labelPdfOrientation(rotation),
    compress: true,
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  // jsPDF stores points internally; the mm→pt→mm round-trip introduces sub-micron
  // float error (e.g. 100 → 99.99999999999999), so compare with a tolerance.
  const EPS_MM = 0.01;
  if (Math.abs(pageW - pageSize.width) > EPS_MM || Math.abs(pageH - pageSize.height) > EPS_MM) {
    throw new Error(
      `Sticker PDF page must be ${pageSize.width}×${pageSize.height} mm at ${rotation}°, got ${pageW}×${pageH} mm.`
    );
  }

  return doc;
}

async function drawStickerPage(
  doc: jsPDF,
  label: PrintableStickerLabel,
  role: StickerRole | undefined,
  qrCache: Map<string, string>,
  rotation: LabelRotationDeg,
  scalePct: LabelScalePct
): Promise<void> {
  const scale = labelScaleMultiplier(scalePct);
  const padH = LABEL_STICKER_PADDING_H_MM;
  const padV = LABEL_STICKER_PADDING_V_MM;
  const contentW = DESIGN_W - padH * 2;

  // --- QR: top, centred horizontally, fills (most of) the 50 mm width ---
  const qrSize = Math.min(LABEL_STICKER_QR_SIZE_MM * scale, contentW);
  const qrX = padH + Math.max(0, (contentW - qrSize) / 2);
  const qrY = padV;

  doc.setTextColor(STICKER_RGB.r, STICKER_RGB.g, STICKER_RGB.b);
  doc.setFont("helvetica", "normal");

  const stickerRole = resolveStickerRole(label, role);
  const batchMark = formatStickerBatchMark(label);
  const fabricLine = `${label.fabric_brand} / ${label.fabric_number}`;
  const specLine = [label.composition, formatWeight(label.weight_gsm)].filter(Boolean).join(" / ");
  const cutLengthLine = formatStickerCutLength(label.cut_quantity, label.cut_unit);
  const labelsLine = formatStickerLabelsSent(label.labels_sent);

  const headerFontMm = LABEL_STICKER_FONT_MM.header * scale;
  const lines: Array<{ text: string; fontMm: number }> = [
    { text: label.client_code, fontMm: LABEL_STICKER_FONT_MM.clientCode * scale },
    { text: label.client_name, fontMm: LABEL_STICKER_FONT_MM.clientName * scale },
    { text: label.production_code, fontMm: LABEL_STICKER_FONT_MM.productionCode * scale },
    { text: fabricLine, fontMm: LABEL_STICKER_FONT_MM.fabric * scale },
    { text: cutLengthLine, fontMm: LABEL_STICKER_FONT_MM.cutLength * scale },
    { text: labelsLine, fontMm: LABEL_STICKER_FONT_MM.labels * scale },
  ];
  if (specLine) lines.push({ text: specLine, fontMm: LABEL_STICKER_FONT_MM.spec * scale });
  lines.push({ text: pieceLabel(label), fontMm: LABEL_STICKER_FONT_MM.piece * scale });

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

  // --- Text block: horizontal lines stacked below the QR, read left-to-right ---
  const gap = LABEL_STICKER_LINE_GAP_MM * scale;
  const textX = padH;
  let y = qrY + qrSize + LABEL_STICKER_COLUMN_GAP_MM * scale;

  const headerH = lineHeightMm(headerFontMm);
  y += headerH / 2;
  doc.setFontSize(mmToPt(headerFontMm));
  drawStickerText(doc, STICKER_ROLE_LABEL[stickerRole], textX, y, rotation, { align: "left" });
  if (batchMark) {
    drawStickerText(doc, batchMark, padH + contentW, y, rotation, { align: "right" });
  }
  y += headerH / 2 + gap;

  for (const line of lines) {
    const lineH = lineHeightMm(line.fontMm);
    y += lineH / 2;
    doc.setFontSize(mmToPt(line.fontMm));
    const fitted = fitText(doc, line.text, contentW);
    drawStickerText(doc, fitted, textX, y, rotation, { align: "left" });
    y += lineH / 2 + gap;
  }
}

export type StickerPdfEntry = {
  label: PrintableStickerLabel;
  role?: StickerRole;
};

export type StickerPdfOptions = {
  rotationDeg?: LabelRotationDeg;
  scalePct?: LabelScalePct;
};

/** Server-generated roll PDF — one label per page, 50×100 mm portrait upright at 0°. */
export async function generateStickerRollPdf(
  entries: StickerPdfEntry[],
  options: StickerPdfOptions = {}
): Promise<Uint8Array> {
  if (entries.length === 0) {
    throw new Error("No sticker labels to print.");
  }

  const rotation = options.rotationDeg ?? DEFAULT_LABEL_ROTATION;
  const scalePct = options.scalePct ?? DEFAULT_LABEL_SCALE_PCT;
  const doc = createStickerPdfDocument(rotation);
  const qrCache = new Map<string, string>();
  const pageSize = labelPdfPageSizeMm(rotation);

  for (let index = 0; index < entries.length; index += 1) {
    if (index > 0) {
      doc.addPage([pageSize.width, pageSize.height], labelPdfOrientation(rotation));
    }
    const entry = entries[index]!;
    await drawStickerPage(doc, entry.label, entry.role, qrCache, rotation, scalePct);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

const TEST_LABEL_BASE: Omit<PrintableStickerLabel, "fabric_number" | "sticker_code" | "sticker_index"> = {
  fabric_line_id: "test-line",
  production_code: "L01-SHT",
  fabric_cut_code: "L01-SHT",
  qr_payload: "L01-SHT",
  client_code: "FR-0128-0019",
  client_name: "Ralph Rahme",
  garment_type: "Shirt",
  piece_name: "Shirt",
  supplier_name: "Solbiati",
  fabric_brand: "Solbiati",
  composition: "100% COTTON TEST",
  weight_gsm: 240,
  cut_quantity: 0.9,
  cut_unit: "meters",
  labels_sent: 1,
  article_number: 1,
  sticker_total: 2,
};

/** Two test labels (S10008 + S10009) — one page each for roll calibration. */
export async function generateTestStickerPdf(
  options: StickerPdfOptions = {}
): Promise<Uint8Array> {
  const entries: StickerPdfEntry[] = [
    {
      label: {
        ...TEST_LABEL_BASE,
        sticker_code: "TEST-S10008",
        fabric_number: "S10008",
        sticker_index: 1,
      },
      role: "prep",
    },
    {
      label: {
        ...TEST_LABEL_BASE,
        sticker_code: "TEST-S10009",
        fabric_number: "S10009",
        sticker_index: 2,
      },
      role: "prep",
    },
  ];

  return generateStickerRollPdf(entries, options);
}
