import {
  LABEL_MATCH_PRINTER_PAGE_H_MM,
  LABEL_MATCH_PRINTER_PAGE_W_MM,
  LABEL_ROLL_HEIGHT_MM,
  LABEL_ROLL_WIDTH_MM,
} from "@/lib/production/label-print-config";
import {
  isPrinterMatchMode,
  labelPdfPageSizeMm,
  PRINTER_MATCH_MODE,
  type LabelPrintMode,
} from "@/lib/production/label-printer-settings";
import { STICKER_RASTER_DPI } from "@/lib/production/render-sticker-raster";

/** Driver media for D550 PDF / fallback portrait browser print. */
export const STICKER_PRINT_PORTRAIT_W_MM = LABEL_MATCH_PRINTER_PAGE_W_MM;
export const STICKER_PRINT_PORTRAIT_H_MM = LABEL_MATCH_PRINTER_PAGE_H_MM;

/**
 * Browser direct print on D550: Chrome sends raster pages without the driver's PDF
 * ~90° CCW turn. Pre-rotate printer-match PNGs to landscape (QR left) and declare a
 * landscape @page so the full label fits — portrait 51×102 + object-fit:fill clips
 * the QR when headers are on or the dialog scales to default paper.
 */
export const STICKER_PRINT_LANDSCAPE_W_MM = LABEL_MATCH_PRINTER_PAGE_H_MM;
export const STICKER_PRINT_LANDSCAPE_H_MM = LABEL_MATCH_PRINTER_PAGE_W_MM;

export const STICKER_PRINT_PAPER_NOTE =
  "Paper: 51×102 mm portrait in the D550 driver. Scale 100% — do NOT use Fit to page if the preview clips.";

export const STICKER_PRINT_SCALE_NOTE =
  "Set Scale to 100% (Actual size). Turn OFF Headers and footers — Chrome adds URL and date otherwise.";

export type StickerPrintHtmlOptions = {
  mode?: LabelPrintMode;
};

function mmToPx(mm: number, dpi = STICKER_RASTER_DPI): number {
  return Math.round((mm * dpi) / 25.4);
}

/** @page size + whether PNGs are already landscape-oriented for this mode. */
export function browserPrintPageLayout(mode: LabelPrintMode = PRINTER_MATCH_MODE): {
  pageW: number;
  pageH: number;
  landscape: boolean;
} {
  if (isPrinterMatchMode(mode)) {
    return {
      pageW: STICKER_PRINT_LANDSCAPE_W_MM,
      pageH: STICKER_PRINT_LANDSCAPE_H_MM,
      landscape: true,
    };
  }

  const { width, height } = labelPdfPageSizeMm(mode);
  return {
    pageW: width,
    pageH: height,
    landscape: width > height,
  };
}

/**
 * Build a minimal print document: one bilevel PNG per page at exact roll size.
 * Images must be data: URLs (base64) — no blob: src — so print() never races image load.
 */
export function buildStickerPrintHtml(
  imageDataUrls: string[],
  options: StickerPrintHtmlOptions = {}
): string {
  const mode = options.mode ?? PRINTER_MATCH_MODE;
  const { pageW, pageH, landscape } = browserPrintPageLayout(mode);
  const pageSizeDecl = landscape
    ? `${pageW}mm ${pageH}mm landscape`
    : `${pageW}mm ${pageH}mm portrait`;
  const imgWpx = mmToPx(pageW);
  const imgHpx = mmToPx(pageH);

  const pages = imageDataUrls
    .map(
      (src) =>
        `<div class="label-page"><img src="${src}" alt="" width="${imgWpx}" height="${imgHpx}" /></div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
@page {
  size: ${pageSizeDecl};
  margin: 0;
}
*, *::before, *::after {
  box-sizing: border-box;
}
html {
  margin: 0;
  padding: 0;
  width: ${pageW}mm;
  height: ${pageH}mm;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body {
  margin: 0;
  padding: 0;
  width: ${pageW}mm;
}
.label-page {
  width: ${pageW}mm;
  height: ${pageH}mm;
  margin: 0;
  padding: 0;
  overflow: hidden;
  page-break-after: always;
  break-after: page;
  break-inside: avoid;
}
.label-page:last-child {
  page-break-after: auto;
  break-after: auto;
}
.label-page img {
  display: block;
  width: ${pageW}mm;
  height: ${pageH}mm;
  max-width: ${pageW}mm;
  max-height: ${pageH}mm;
  margin: 0;
  padding: 0;
  object-fit: fill;
  object-position: center center;
}
@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
  }
  .label-page {
    margin: 0 !important;
    padding: 0 !important;
  }
}
</style>
</head>
<body>
${pages}
</body>
</html>`;
}

/** True when browser print should pre-rotate PNGs (printer-match portrait → landscape). */
export function browserPrintNeedsLandscapeRotate(mode: LabelPrintMode): boolean {
  return isPrinterMatchMode(mode);
}

/** Server sticker ZIP uses stored (uncompressed) entries only. */
export async function extractPngBlobsFromZip(zipBlob: Blob): Promise<Blob[]> {
  const buffer = await zipBlob.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const pngs: Blob[] = [];
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) break;

    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const filenameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);

    const nameStart = offset + 30;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + filenameLength));
    const dataStart = nameStart + filenameLength + extraLength;
    const dataEnd = dataStart + compressedSize;

    if (compressionMethod !== 0) {
      throw new Error(`Unsupported zip compression in ${name}`);
    }

    if (name.toLowerCase().endsWith(".png")) {
      pngs.push(new Blob([bytes.subarray(dataStart, dataEnd)], { type: "image/png" }));
    }

    offset = dataEnd;
  }

  return pngs;
}

export async function pngBlobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read PNG blob"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Rotate portrait printer-match PNG 270° CW — same transform as scripts/render-real-test-stickers
 * printsim — so browser print matches physical D550 output (QR left, text horizontal).
 */
export async function rotatePngBlobLandscapeCw270(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.height;
  canvas.height = bitmap.width;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas not available for sticker print rotation");
  }
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((3 * Math.PI) / 2);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();
  return canvas.toDataURL("image/png");
}

export async function prepareBrowserPrintDataUrl(
  blob: Blob,
  mode: LabelPrintMode
): Promise<string> {
  if (browserPrintNeedsLandscapeRotate(mode)) {
    return rotatePngBlobLandscapeCw270(blob);
  }
  return pngBlobToDataUrl(blob);
}

export function waitForDocumentImages(doc: Document): Promise<void> {
  const images = [...doc.querySelectorAll("img")];
  if (images.length === 0) return Promise.reject(new Error("No print images"));

  return new Promise((resolve, reject) => {
    let loaded = 0;
    const total = images.length;

    const onDone = () => {
      loaded += 1;
      if (loaded === total) resolve();
    };

    for (const img of images) {
      if (img.complete && img.naturalWidth > 0) {
        onDone();
        continue;
      }
      img.addEventListener("load", onDone, { once: true });
      img.addEventListener("error", () => reject(new Error("Print image failed to load")), {
        once: true,
      });
    }
  });
}

/** Physical roll dimensions for verify scripts. */
export const LABEL_ROLL_W_MM = LABEL_ROLL_WIDTH_MM;
export const LABEL_ROLL_H_MM = LABEL_ROLL_HEIGHT_MM;
