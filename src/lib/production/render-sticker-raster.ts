import sharp from "sharp";
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
import { stripBrandPrefixFromProductionCode } from "@/lib/sales-orders/label-codes";

/** 300 DPI — thermal printers are typically 203–300 DPI; bitmap must be sharp at print size. */
export const STICKER_RASTER_DPI = 300;

/**
 * D550 / LabelLife drivers fail on PDF images with alpha (/SMask soft masks) and on
 * anti-aliased gray pixels. Output must be opaque RGB bilevel black-on-white only.
 */
const THERMAL_WHITE = "#ffffff";
const THERMAL_BLACK_THRESHOLD = 128;

const STICKER_COLOR = "#000000";
const LINE_HEIGHT_FACTOR = 1.15;

const PORTRAIT_W = LABEL_ROLL_WIDTH_MM;
const PORTRAIT_H = LABEL_ROLL_HEIGHT_MM;
const LANDSCAPE_W = LABEL_ROLL_HEIGHT_MM;
const LANDSCAPE_H = LABEL_ROLL_WIDTH_MM;

type LayoutKind = "portrait" | "landscape";

function layoutKindForMode(mode: LabelPrintMode): LayoutKind {
  return mode === 90 || mode === 270 ? "landscape" : "portrait";
}

function isFlipped(mode: LabelPrintMode): boolean {
  return mode === 180 || mode === 270;
}

function designDims(mode: LabelPrintMode): { W: number; H: number } {
  if (mode === PRINTER_MATCH_MODE) {
    return { W: LABEL_MATCH_PRINTER_PAGE_W_MM, H: LABEL_MATCH_PRINTER_PAGE_H_MM };
  }
  return layoutKindForMode(mode) === "landscape"
    ? { W: LANDSCAPE_W, H: LANDSCAPE_H }
    : { W: PORTRAIT_W, H: PORTRAIT_H };
}

function mmToPx(mm: number, dpi = STICKER_RASTER_DPI): number {
  return (mm * dpi) / 25.4;
}

function lineHeightMm(fontMm: number): number {
  return fontMm * LINE_HEIGHT_FACTOR;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Rough Helvetica width estimate for truncation (avg 0.52× font size per char). */
function fitTextApprox(text: string, maxWidthMm: number, fontMm: number): string {
  const maxChars = Math.max(1, Math.floor(maxWidthMm / (fontMm * 0.52)));
  if (text.length <= maxChars) return text;
  const trimmed = text.slice(0, Math.max(1, maxChars - 1));
  return `${trimmed}…`;
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

async function fetchQrPngBuffer(payload: string, size = 450): Promise<Buffer> {
  const res = await fetch(qrImageFetchUrl(payload, size));
  if (!res.ok) throw new Error("Failed to load QR code image.");
  return Buffer.from(await res.arrayBuffer());
}

type TextLine = { text: string; fontMm: number; x: number; y: number; align?: "left" | "right" | "center" };

function svgTextLine(line: TextLine): string {
  const anchor =
    line.align === "right" ? "end" : line.align === "center" ? "middle" : "start";
  return `<text x="${line.x}" y="${line.y}" font-family="Helvetica, Arial, sans-serif" font-size="${line.fontMm}" fill="${STICKER_COLOR}" text-anchor="${anchor}" dominant-baseline="middle">${escapeXml(line.text)}</text>`;
}

export type StickerQrPlacementMm = {
  x: number;
  y: number;
  size: number;
};

export type StickerRasterLayout = {
  pageW: number;
  pageH: number;
  svg: string;
  qr: StickerQrPlacementMm;
};

/** Build full-page SVG for one sticker (upright design space; flip applied after rasterize). */
export function buildStickerPageSvg(
  label: PrintableStickerLabel,
  role: StickerRole | undefined,
  mode: LabelPrintMode,
  scalePct: LabelScalePct
): StickerRasterLayout {
  const scale = labelScaleMultiplier(scalePct);
  const kind = layoutKindForMode(mode);
  const dims = designDims(mode);
  const padH = LABEL_STICKER_PADDING_H_MM;
  const padV = LABEL_STICKER_PADDING_V_MM;
  const columnGap = LABEL_STICKER_COLUMN_GAP_MM * scale;

  let qrSize: number;
  let qrX: number;
  let qrY: number;
  let textX: number;
  let textRightX: number;
  let textTop: number;

  if (kind === "landscape") {
    const availH = dims.H - padV * 2;
    qrSize = Math.min(LABEL_STICKER_QR_SIZE_MM * scale, availH);
    qrX = padH;
    qrY = padV + Math.max(0, (availH - qrSize) / 2);
    textX = padH + qrSize + columnGap;
    textRightX = dims.W - padH;
    textTop = padV;
  } else {
    const availW = dims.W - padH * 2;
    qrSize = Math.min(LABEL_STICKER_QR_SIZE_MM * scale, availW);
    qrX = padH + Math.max(0, (availW - qrSize) / 2);
    qrY = padV;
    textX = padH;
    textRightX = dims.W - padH;
    textTop = qrY + qrSize + columnGap;
  }

  const contentW = textRightX - textX;
  const stickerRole = resolveStickerRole(label, role);
  const productionCodeLine =
    stickerRole === "prep"
      ? stripBrandPrefixFromProductionCode(label.production_code, label.client_code)
      : label.production_code;
  const batchMark = formatStickerBatchMark(label);
  const fabricLine = `${label.fabric_brand} / ${label.fabric_number}`;
  const specLine = [label.composition, formatWeight(label.weight_gsm)].filter(Boolean).join(" / ");
  const cutLengthLine = formatStickerCutLength(label.cut_quantity, label.cut_unit);
  const labelsLine = formatStickerLabelsSent(label.labels_sent);

  const headerFontMm = LABEL_STICKER_FONT_MM.header * scale;
  const lines: Array<{ text: string; fontMm: number }> = [
    { text: label.client_code, fontMm: LABEL_STICKER_FONT_MM.clientCode * scale },
    { text: label.client_name, fontMm: LABEL_STICKER_FONT_MM.clientName * scale },
    { text: productionCodeLine, fontMm: LABEL_STICKER_FONT_MM.productionCode * scale },
    { text: fabricLine, fontMm: LABEL_STICKER_FONT_MM.fabric * scale },
    { text: cutLengthLine, fontMm: LABEL_STICKER_FONT_MM.cutLength * scale },
    { text: labelsLine, fontMm: LABEL_STICKER_FONT_MM.labels * scale },
  ];
  if (specLine) lines.push({ text: specLine, fontMm: LABEL_STICKER_FONT_MM.spec * scale });
  lines.push({ text: pieceLabel(label), fontMm: LABEL_STICKER_FONT_MM.piece * scale });

  const textElements: string[] = [];
  const gap = LABEL_STICKER_LINE_GAP_MM * scale;
  let y = textTop;

  const headerH = lineHeightMm(headerFontMm);
  y += headerH / 2;
  textElements.push(
    svgTextLine({
      text: STICKER_ROLE_LABEL[stickerRole],
      fontMm: headerFontMm,
      x: textX,
      y,
      align: "left",
    })
  );
  if (batchMark) {
    textElements.push(
      svgTextLine({ text: batchMark, fontMm: headerFontMm, x: textRightX, y, align: "right" })
    );
  }
  y += headerH / 2 + gap;

  for (const line of lines) {
    const lineH = lineHeightMm(line.fontMm);
    y += lineH / 2;
    const fitted = fitTextApprox(line.text, contentW, line.fontMm);
    textElements.push(
      svgTextLine({ text: fitted, fontMm: line.fontMm, x: textX, y, align: "left" })
    );
    y += lineH / 2 + gap;
  }

  // QR is composited after SVG rasterize (nearest-neighbor). Embedding the QR PNG in the
  // SVG and bilevel-thresholding the raster creates hollow module outlines from librsvg
  // anti-aliasing when the image is scaled to print resolution.
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
  width="${dims.W}mm" height="${dims.H}mm" viewBox="0 0 ${dims.W} ${dims.H}">
  <rect width="${dims.W}" height="${dims.H}" fill="#ffffff"/>
  ${textElements.join("\n  ")}
</svg>`;

  return { pageW: dims.W, pageH: dims.H, svg, qr: { x: qrX, y: qrY, size: qrSize } };
}

/** Opaque 1-bit bilevel PNG — no alpha channel (jsPDF must not emit /SMask). */
async function finalizeThermalRaster(pipeline: sharp.Sharp): Promise<Buffer> {
  return pipeline
    .flatten({ background: THERMAL_WHITE })
    .greyscale()
    .threshold(THERMAL_BLACK_THRESHOLD)
    .png({ compressionLevel: 6, palette: true, colours: 2, dither: 0 })
    .toBuffer();
}

async function compositeQrOnRaster(
  textLayer: Buffer,
  qrPng: Buffer,
  qr: StickerQrPlacementMm
): Promise<sharp.Sharp> {
  const qrPx = Math.round(mmToPx(qr.size));
  const qrX = Math.round(mmToPx(qr.x));
  const qrY = Math.round(mmToPx(qr.y));
  const qrResized = await sharp(qrPng)
    .resize(qrPx, qrPx, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();

  return sharp(textLayer).composite([{ input: qrResized, left: qrX, top: qrY }]);
}

/** Rasterize sticker SVG (+ optional 180° flip) to PNG at STICKER_RASTER_DPI. */
export async function rasterizeStickerSvg(
  svg: string,
  pageW: number,
  pageH: number,
  mode: LabelPrintMode,
  qrPng?: Buffer,
  qr?: StickerQrPlacementMm
): Promise<Buffer> {
  const widthPx = Math.round(mmToPx(pageW));
  const heightPx = Math.round(mmToPx(pageH));

  const textLayer = await sharp(Buffer.from(svg), { density: STICKER_RASTER_DPI })
    .resize(widthPx, heightPx, { fit: "fill" })
    .flatten({ background: THERMAL_WHITE })
    .png()
    .toBuffer();

  let pipeline: sharp.Sharp =
    qrPng && qr ? await compositeQrOnRaster(textLayer, qrPng, qr) : sharp(textLayer);

  if (isFlipped(mode)) {
    pipeline = pipeline.rotate(180);
  }

  return finalizeThermalRaster(pipeline);
}

export async function renderStickerPagePng(
  label: PrintableStickerLabel,
  role: StickerRole | undefined,
  qrCache: Map<string, Buffer>,
  mode: LabelPrintMode,
  scalePct: LabelScalePct
): Promise<Buffer> {
  let qrBuf = qrCache.get(label.qr_payload);
  if (!qrBuf) {
    qrBuf = await fetchQrPngBuffer(label.qr_payload, 450);
    qrCache.set(label.qr_payload, qrBuf);
  }

  const layout = buildStickerPageSvg(label, role, mode, scalePct);
  return rasterizeStickerSvg(layout.svg, layout.pageW, layout.pageH, mode, qrBuf, layout.qr);
}

/** Calibration page: huge letter + QR + text, whole design box rotated CW about page centre. */
export function buildCalibrationPageSvg(
  pageW: number,
  pageH: number,
  letter: string,
  rotationDeg: number,
  qrPngBase64: string
): string {
  const DESIGN = 48;
  const cx = pageW / 2;
  const cy = pageH / 2;
  const theta = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const mapPoint = (dx: number, dy: number): { x: number; y: number } => {
    const rx = dx - DESIGN / 2;
    const ry = dy - DESIGN / 2;
    return { x: cx + rx * cos - ry * sin, y: cy + rx * sin + ry * cos };
  };

  const c0 = mapPoint(0, 0);
  const c1 = mapPoint(DESIGN, 0);
  const c2 = mapPoint(DESIGN, DESIGN);
  const c3 = mapPoint(0, DESIGN);

  const qrSize = 16;
  const qrCenter = mapPoint(3 + qrSize / 2, 3 + qrSize / 2);
  const qrX = qrCenter.x - qrSize / 2;
  const qrY = qrCenter.y - qrSize / 2;

  const textAt = (
    text: string,
    dx: number,
    dy: number,
    fontMm: number,
    align: "left" | "center" | "right"
  ): string => {
    const p = mapPoint(dx, dy);
    const anchor = align === "right" ? "end" : align === "center" ? "middle" : "start";
    return `<text x="${p.x}" y="${p.y}" font-family="Helvetica, Arial, sans-serif" font-size="${fontMm}" fill="${STICKER_COLOR}" text-anchor="${anchor}" dominant-baseline="middle">${escapeXml(text)}</text>`;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${pageW}mm" height="${pageH}mm" viewBox="0 0 ${pageW} ${pageH}">
  <rect width="${pageW}" height="${pageH}" fill="#ffffff"/>
  <polygon points="${c0.x},${c0.y} ${c1.x},${c1.y} ${c2.x},${c2.y} ${c3.x},${c3.y}"
    fill="none" stroke="${STICKER_COLOR}" stroke-width="0.4"/>
  <image xlink:href="data:image/png;base64,${qrPngBase64}" x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}"/>
  ${textAt("QR LEFT", 22, 7, 3.6, "left")}
  ${textAt("TEXT HORIZONTAL", 22, 12.5, 3.0, "left")}
  ${textAt(letter, DESIGN / 2, 30, 30, "center")}
  ${textAt(`${letter} = ${rotationDeg}°`, DESIGN / 2, 45, 4.2, "center")}
</svg>`;
}

export async function renderCalibrationPagePng(
  letter: string,
  rotationDeg: number,
  qrPngBase64: string
): Promise<Buffer> {
  const pageW = LABEL_MATCH_PRINTER_PAGE_W_MM;
  const pageH = LABEL_MATCH_PRINTER_PAGE_H_MM;
  const svg = buildCalibrationPageSvg(pageW, pageH, letter, rotationDeg, qrPngBase64);
  const widthPx = Math.round(mmToPx(pageW));
  const heightPx = Math.round(mmToPx(pageH));

  return finalizeThermalRaster(
    sharp(Buffer.from(svg), { density: STICKER_RASTER_DPI }).resize(widthPx, heightPx, { fit: "fill" })
  );
}

export function pngToDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** Reject anti-aliased gray rasters before JPEG — they print as hollow/fringed text. */
async function assertBilevelThermalPng(png: Buffer): Promise<void> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const v = data[i]!;
    if (v !== 0 && v !== 255) {
      throw new Error(
        "Sticker raster must be bilevel black-on-white before PDF JPEG embed (found anti-aliased gray pixels)."
      );
    }
  }
}

/**
 * JPEG data URL for jsPDF embed. The D550 / LabelLife driver prints blank pages when
 * jsPDF packs bilevel PNGs as Indexed 1-bit FlateDecode XObjects; 8-bit DCTDecode JPEG
 * is widely supported. PNG downloads still use bilevel PNG for Preview.app printing.
 */
export async function pngToJpegDataUrl(png: Buffer): Promise<string> {
  await assertBilevelThermalPng(png);
  const jpeg = await sharp(png).jpeg({ quality: 95, mozjpeg: true }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}
