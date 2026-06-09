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
 * Two NATIVE designs — each drawn upright for its own page orientation, so text
 * always reads horizontally left-to-right. No element is ever turned sideways.
 *
 *   - PORTRAIT 50×100  (rotation 0° / 180°): QR on top, text stacked below.
 *   - LANDSCAPE 100×50 (rotation 90° / 270°): QR on the LEFT, text column on the
 *     RIGHT. This is the layout for printers whose physical label is landscape
 *     (the 100 mm long edge feeds across / along the head).
 *
 * The optional 180° "flip" (rotation 180° or 270°) maps every element through the
 * page centre for printers that feed the label upside down. It is NOT a 90° turn.
 */
const PORTRAIT_W = LABEL_ROLL_WIDTH_MM; // 50
const PORTRAIT_H = LABEL_ROLL_HEIGHT_MM; // 100
const LANDSCAPE_W = LABEL_ROLL_HEIGHT_MM; // 100
const LANDSCAPE_H = LABEL_ROLL_WIDTH_MM; // 50

type LayoutKind = "portrait" | "landscape";

function layoutKindForRotation(rotation: LabelRotationDeg): LayoutKind {
  return rotation === 90 || rotation === 270 ? "landscape" : "portrait";
}

/** 180° flip through the page centre (upside-down feed), never a 90° turn. */
function isFlipped(rotation: LabelRotationDeg): boolean {
  return rotation === 180 || rotation === 270;
}

function designDims(kind: LayoutKind): { W: number; H: number } {
  return kind === "landscape"
    ? { W: LANDSCAPE_W, H: LANDSCAPE_H }
    : { W: PORTRAIT_W, H: PORTRAIT_H };
}

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

/** Map an upright design point onto the page (identity, or 180° through centre). */
function mapPoint(
  x: number,
  y: number,
  flip: boolean,
  W: number,
  H: number
): { x: number; y: number } {
  return flip ? { x: W - x, y: H - y } : { x, y };
}

/** Map an upright design rectangle (top-left + size) onto the page. */
function mapRect(
  x: number,
  y: number,
  w: number,
  h: number,
  flip: boolean,
  W: number,
  H: number
): { x: number; y: number; w: number; h: number } {
  return flip ? { x: W - x - w, y: H - y - h, w, h } : { x, y, w, h };
}

function drawStickerText(
  doc: jsPDF,
  text: string,
  layoutX: number,
  layoutY: number,
  flip: boolean,
  dims: { W: number; H: number },
  options: { align?: "left" | "right" | "center" } = {}
): void {
  const { x, y } = mapPoint(layoutX, layoutY, flip, dims.W, dims.H);
  doc.text(text, x, y, {
    align: options.align ?? "left",
    baseline: "middle",
    angle: flip ? 180 : 0,
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
  const kind = layoutKindForRotation(rotation);
  const flip = isFlipped(rotation);
  const dims = designDims(kind);
  const padH = LABEL_STICKER_PADDING_H_MM;
  const padV = LABEL_STICKER_PADDING_V_MM;
  const columnGap = LABEL_STICKER_COLUMN_GAP_MM * scale;

  // --- Geometry per native orientation ---
  // Portrait: QR on top (centred across the 50 mm width), text stacked below.
  // Landscape: QR on the left (centred over the 50 mm height), text column right.
  let qrSize: number;
  let qrX: number;
  let qrY: number;
  let textX: number;
  let textRightX: number;
  let textTop: number;

  if (kind === "landscape") {
    const availH = dims.H - padV * 2; // 46 mm
    qrSize = Math.min(LABEL_STICKER_QR_SIZE_MM * scale, availH);
    qrX = padH;
    qrY = padV + Math.max(0, (availH - qrSize) / 2);
    textX = padH + qrSize + columnGap;
    textRightX = dims.W - padH;
    textTop = padV;
  } else {
    const availW = dims.W - padH * 2; // 46 mm
    qrSize = Math.min(LABEL_STICKER_QR_SIZE_MM * scale, availW);
    qrX = padH + Math.max(0, (availW - qrSize) / 2);
    qrY = padV;
    textX = padH;
    textRightX = dims.W - padH;
    textTop = qrY + qrSize + columnGap;
  }

  const contentW = textRightX - textX;

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

  const mapped = mapRect(qrX, qrY, qrSize, qrSize, flip, dims.W, dims.H);
  doc.addImage(
    qrData,
    "PNG",
    mapped.x,
    mapped.y,
    mapped.w,
    mapped.h,
    undefined,
    undefined,
    flip ? 180 : 0
  );

  // --- Text block: horizontal lines, read left-to-right ---
  const gap = LABEL_STICKER_LINE_GAP_MM * scale;
  let y = textTop;

  const headerH = lineHeightMm(headerFontMm);
  y += headerH / 2;
  doc.setFontSize(mmToPt(headerFontMm));
  drawStickerText(doc, STICKER_ROLE_LABEL[stickerRole], textX, y, flip, dims, { align: "left" });
  if (batchMark) {
    drawStickerText(doc, batchMark, textRightX, y, flip, dims, { align: "right" });
  }
  y += headerH / 2 + gap;

  for (const line of lines) {
    const lineH = lineHeightMm(line.fontMm);
    y += lineH / 2;
    doc.setFontSize(mmToPt(line.fontMm));
    const fitted = fitText(doc, line.text, contentW);
    drawStickerText(doc, fitted, textX, y, flip, dims, { align: "left" });
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
