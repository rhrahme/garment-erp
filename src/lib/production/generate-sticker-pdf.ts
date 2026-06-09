import { jsPDF } from "jspdf";
import {
  LABEL_MATCH_PRINTER_PAGE_H_MM,
  LABEL_MATCH_PRINTER_PAGE_W_MM,
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
  PRINTER_MATCH_MODE,
  type LabelPrintMode,
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
 * Designs are always drawn upright in a "design space" so text reads horizontally
 * left-to-right; a per-mode transform places them onto the PDF page.
 *
 *   - PORTRAIT 50×100  (mode 0° / 180°): QR on top, text stacked below.
 *   - LANDSCAPE 100×50 (mode 90° / 270°): QR LEFT, text column RIGHT.
 *   - PRINTER-MATCH (default): the LANDSCAPE design (102×51 to fill the media) is
 *     drawn pre-rotated 90° CW onto a PORTRAIT 51×102 page. The D550 driver
 *     rasterises with a fixed ~90° CCW turn under "Fit to paper", which cancels
 *     the pre-rotation, so the physical landscape label reads horizontally.
 *
 * The optional 180° "flip" (mode 180° or 270°) maps every element through the
 * page centre for printers that feed the label upside down. It is NOT a 90° turn.
 */
const PORTRAIT_W = LABEL_ROLL_WIDTH_MM; // 50
const PORTRAIT_H = LABEL_ROLL_HEIGHT_MM; // 100
const LANDSCAPE_W = LABEL_ROLL_HEIGHT_MM; // 100
const LANDSCAPE_H = LABEL_ROLL_WIDTH_MM; // 50
// printer-match design fills the 51×102 media exactly (landscape 102×51).
const MATCH_DESIGN_W = LABEL_MATCH_PRINTER_PAGE_H_MM; // 102
const MATCH_DESIGN_H = LABEL_MATCH_PRINTER_PAGE_W_MM; // 51

type LayoutKind = "portrait" | "landscape";

function layoutKindForMode(mode: LabelPrintMode): LayoutKind {
  return mode === 90 || mode === 270 || mode === PRINTER_MATCH_MODE ? "landscape" : "portrait";
}

/** 180° flip through the page centre (upside-down feed), never a 90° turn. */
function isFlipped(mode: LabelPrintMode): boolean {
  return mode === 180 || mode === 270;
}

function designDims(mode: LabelPrintMode): { W: number; H: number } {
  if (mode === PRINTER_MATCH_MODE) return { W: MATCH_DESIGN_W, H: MATCH_DESIGN_H };
  return layoutKindForMode(mode) === "landscape"
    ? { W: LANDSCAPE_W, H: LANDSCAPE_H }
    : { W: PORTRAIT_W, H: PORTRAIT_H };
}

/**
 * Maps an upright design point/rect/angle onto the PDF page for the given mode.
 *   - identity:      portrait/landscape native (no flip).
 *   - 180° flip:     through the page centre (upside-down feed).
 *   - printer-match: 90° CW pre-rotation (xp = designH − yd, yp = xd). The text
 *     angle 270 and image angle 0 were verified by rendering + simulating the
 *     printer's ~90° CCW turn: QR left, horizontal text right on the label.
 */
type StickerTransform = {
  mapPoint: (x: number, y: number) => { x: number; y: number };
  mapRect: (x: number, y: number, w: number, h: number) => { x: number; y: number; w: number; h: number };
  textAngle: number;
  imageAngle: number;
};

function buildTransform(mode: LabelPrintMode, dims: { W: number; H: number }): StickerTransform {
  if (mode === PRINTER_MATCH_MODE) {
    const Hd = dims.H; // 51
    return {
      mapPoint: (x, y) => ({ x: Hd - y, y: x }),
      mapRect: (x, y, w, h) => ({ x: Hd - y - h, y: x, w: h, h: w }),
      textAngle: 270,
      imageAngle: 0,
    };
  }
  if (isFlipped(mode)) {
    return {
      mapPoint: (x, y) => ({ x: dims.W - x, y: dims.H - y }),
      mapRect: (x, y, w, h) => ({ x: dims.W - x - w, y: dims.H - y - h, w, h }),
      textAngle: 180,
      imageAngle: 180,
    };
  }
  return {
    mapPoint: (x, y) => ({ x, y }),
    mapRect: (x, y, w, h) => ({ x, y, w, h }),
    textAngle: 0,
    imageAngle: 0,
  };
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

function drawStickerText(
  doc: jsPDF,
  text: string,
  layoutX: number,
  layoutY: number,
  transform: StickerTransform,
  options: { align?: "left" | "right" | "center" } = {}
): void {
  const { x, y } = transform.mapPoint(layoutX, layoutY);
  doc.text(text, x, y, {
    align: options.align ?? "left",
    baseline: "middle",
    angle: transform.textAngle,
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

function createStickerPdfDocument(mode: LabelPrintMode): jsPDF {
  const pageSize = labelPdfPageSizeMm(mode);
  const doc = new jsPDF({
    unit: "mm",
    format: [pageSize.width, pageSize.height],
    orientation: labelPdfOrientation(mode),
    compress: true,
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  // jsPDF stores points internally; the mm→pt→mm round-trip introduces sub-micron
  // float error (e.g. 100 → 99.99999999999999), so compare with a tolerance.
  const EPS_MM = 0.01;
  if (Math.abs(pageW - pageSize.width) > EPS_MM || Math.abs(pageH - pageSize.height) > EPS_MM) {
    throw new Error(
      `Sticker PDF page must be ${pageSize.width}×${pageSize.height} mm for mode ${mode}, got ${pageW}×${pageH} mm.`
    );
  }

  return doc;
}

async function drawStickerPage(
  doc: jsPDF,
  label: PrintableStickerLabel,
  role: StickerRole | undefined,
  qrCache: Map<string, string>,
  mode: LabelPrintMode,
  scalePct: LabelScalePct
): Promise<void> {
  const scale = labelScaleMultiplier(scalePct);
  const kind = layoutKindForMode(mode);
  const dims = designDims(mode);
  const transform = buildTransform(mode, dims);
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

  const mapped = transform.mapRect(qrX, qrY, qrSize, qrSize);
  doc.addImage(
    qrData,
    "PNG",
    mapped.x,
    mapped.y,
    mapped.w,
    mapped.h,
    undefined,
    undefined,
    transform.imageAngle
  );

  // --- Text block: horizontal lines, read left-to-right ---
  const gap = LABEL_STICKER_LINE_GAP_MM * scale;
  let y = textTop;

  const headerH = lineHeightMm(headerFontMm);
  y += headerH / 2;
  doc.setFontSize(mmToPt(headerFontMm));
  drawStickerText(doc, STICKER_ROLE_LABEL[stickerRole], textX, y, transform, { align: "left" });
  if (batchMark) {
    drawStickerText(doc, batchMark, textRightX, y, transform, { align: "right" });
  }
  y += headerH / 2 + gap;

  for (const line of lines) {
    const lineH = lineHeightMm(line.fontMm);
    y += lineH / 2;
    doc.setFontSize(mmToPt(line.fontMm));
    const fitted = fitText(doc, line.text, contentW);
    drawStickerText(doc, fitted, textX, y, transform, { align: "left" });
    y += lineH / 2 + gap;
  }
}

export type StickerPdfEntry = {
  label: PrintableStickerLabel;
  role?: StickerRole;
};

export type StickerPdfOptions = {
  rotationDeg?: LabelPrintMode;
  scalePct?: LabelScalePct;
};

/**
 * Server-generated roll PDF — one label per page. Default mode "printer-match"
 * outputs a 51×102 mm portrait page with the landscape design pre-rotated 90° CW.
 */
export async function generateStickerRollPdf(
  entries: StickerPdfEntry[],
  options: StickerPdfOptions = {}
): Promise<Uint8Array> {
  if (entries.length === 0) {
    throw new Error("No sticker labels to print.");
  }

  const mode = options.rotationDeg ?? DEFAULT_LABEL_ROTATION;
  const scalePct = options.scalePct ?? DEFAULT_LABEL_SCALE_PCT;
  const doc = createStickerPdfDocument(mode);
  const qrCache = new Map<string, string>();
  const pageSize = labelPdfPageSizeMm(mode);

  for (let index = 0; index < entries.length; index += 1) {
    if (index > 0) {
      doc.addPage([pageSize.width, pageSize.height], labelPdfOrientation(mode));
    }
    const entry = entries[index]!;
    await drawStickerPage(doc, entry.label, entry.role, qrCache, mode, scalePct);
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
