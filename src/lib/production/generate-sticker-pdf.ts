import { jsPDF } from "jspdf";
import { buildZipBuffer } from "@/lib/utils/create-zip";
import {
  LABEL_MATCH_PRINTER_PAGE_H_MM,
  LABEL_MATCH_PRINTER_PAGE_W_MM,
} from "@/lib/production/label-print-config";
import {
  DEFAULT_LABEL_ROTATION,
  DEFAULT_LABEL_SCALE_PCT,
  labelPdfOrientation,
  labelPdfPageSizeMm,
  PRINTER_MATCH_MODE,
  type LabelPrintMode,
  type LabelScalePct,
} from "@/lib/production/label-printer-settings";
import type { PrintableStickerLabel } from "@/lib/production/qr-labels";
import {
  pngToJpegDataUrl,
  renderCalibrationPagePng,
  renderStickerPagePng,
  rotatePortraitPngForBrowserPrint,
} from "@/lib/production/render-sticker-raster";

/**
 * D550 / LabelLife drivers do not reliably print PDF vector text (Tj operators) or
 * Indexed 1-bit FlateDecode PNG XObjects (blank labels). Each page is rendered
 * server-side (SVG → bilevel PNG via sharp), converted to JPEG for jsPDF embed,
 * and placed edge-to-edge with a single addImage(0, 0, pageW, pageH).
 */
async function fetchQrPngBase64(payload: string): Promise<string> {
  const { qrImageFetchUrl } = await import("@/lib/production/qr-labels");
  const res = await fetch(qrImageFetchUrl(payload, 380));
  if (!res.ok) throw new Error("Failed to load QR code image.");
  return Buffer.from(await res.arrayBuffer()).toString("base64");
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
  const EPS_MM = 0.01;
  if (Math.abs(pageW - pageSize.width) > EPS_MM || Math.abs(pageH - pageSize.height) > EPS_MM) {
    throw new Error(
      `Sticker PDF page must be ${pageSize.width}×${pageSize.height} mm for mode ${mode}, got ${pageW}×${pageH} mm.`
    );
  }

  return doc;
}

/** Embed one full-page raster as 8-bit JPEG (DCTDecode) — no /SMask, no Indexed 1-bit PNG. */
async function embedFullPageBitmap(
  doc: jsPDF,
  png: Buffer,
  pageW: number,
  pageH: number
): Promise<void> {
  doc.addImage(await pngToJpegDataUrl(png), "JPEG", 0, 0, pageW, pageH);
}

export type StickerPdfEntry = {
  label: PrintableStickerLabel;
  role?: import("@/lib/production/qr-labels").StickerRole;
};

export type StickerPdfOptions = {
  rotationDeg?: LabelPrintMode;
  scalePct?: LabelScalePct;
  /** Landscape 102×51 rasters for browser print — server pre-rotates portrait PNGs. */
  browserPrint?: boolean;
};

/**
 * Server-generated roll PDF — one rasterised label per page.
 * Default mode "printer-match" outputs 51×102 mm portrait bitmap pages.
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
  const qrCache = new Map<string, Buffer>();
  const pageSize = labelPdfPageSizeMm(mode);

  for (let index = 0; index < entries.length; index += 1) {
    if (index > 0) {
      doc.addPage([pageSize.width, pageSize.height], labelPdfOrientation(mode));
    }
    const entry = entries[index]!;
    const png = await renderStickerPagePng(entry.label, entry.role, qrCache, mode, scalePct);
    await embedFullPageBitmap(doc, png, pageSize.width, pageSize.height);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

/** Raw PNG buffers — one per label (for proof scripts and Download PNG). */
export async function generateStickerRollPngs(
  entries: StickerPdfEntry[],
  options: StickerPdfOptions = {}
): Promise<Buffer[]> {
  if (entries.length === 0) {
    throw new Error("No sticker labels to print.");
  }

  const mode = options.rotationDeg ?? DEFAULT_LABEL_ROTATION;
  const scalePct = options.scalePct ?? DEFAULT_LABEL_SCALE_PCT;
  const qrCache = new Map<string, Buffer>();
  const pngs: Buffer[] = [];

  for (const entry of entries) {
    pngs.push(await renderStickerPagePng(entry.label, entry.role, qrCache, mode, scalePct));
  }

  if (options.browserPrint && mode === PRINTER_MATCH_MODE) {
    return Promise.all(pngs.map((png) => rotatePortraitPngForBrowserPrint(png)));
  }

  return pngs;
}

/** ZIP of one PNG per label (multi-page roll download). */
export async function generateStickerRollPngZip(
  entries: StickerPdfEntry[],
  options: StickerPdfOptions = {},
  filenamePrefix = "sticker"
): Promise<Uint8Array> {
  const pngs = await generateStickerRollPngs(entries, options);
  const zip = buildZipBuffer(
    pngs.map((png, index) => ({
      name: `${filenamePrefix}-${index + 1}.png`,
      data: png,
    }))
  );

  return new Uint8Array(zip);
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

export const CALIBRATION_PAGES: ReadonlyArray<{
  letter: string;
  rotationDeg: 0 | 90 | 180 | 270;
}> = [
  { letter: "A", rotationDeg: 0 },
  { letter: "B", rotationDeg: 90 },
  { letter: "C", rotationDeg: 180 },
  { letter: "D", rotationDeg: 270 },
] as const;

export const CALIBRATION_WINNER: string | null = null;

export async function generateCalibrationStickerPdf(
  options: { letters?: string[] } = {}
): Promise<Uint8Array> {
  const pageW = LABEL_MATCH_PRINTER_PAGE_W_MM;
  const pageH = LABEL_MATCH_PRINTER_PAGE_H_MM;
  const pages = options.letters
    ? CALIBRATION_PAGES.filter((p) => options.letters!.includes(p.letter))
    : CALIBRATION_PAGES;
  if (pages.length === 0) throw new Error("No calibration pages to render.");

  const doc = new jsPDF({
    unit: "mm",
    format: [pageW, pageH],
    orientation: "portrait",
    compress: true,
  });

  const qrBase64 = await fetchQrPngBase64("CALIBRATION");

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]!;
    if (index > 0) doc.addPage([pageW, pageH], "portrait");
    const png = await renderCalibrationPagePng(page.letter, page.rotationDeg, qrBase64);
    await embedFullPageBitmap(doc, png, pageW, pageH);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

export async function generateCalibrationStickerPngs(
  options: { letters?: string[] } = {}
): Promise<Buffer[]> {
  const pages = options.letters
    ? CALIBRATION_PAGES.filter((p) => options.letters!.includes(p.letter))
    : CALIBRATION_PAGES;
  if (pages.length === 0) throw new Error("No calibration pages to render.");

  const qrBase64 = await fetchQrPngBase64("CALIBRATION");
  const pngs: Buffer[] = [];

  for (const page of pages) {
    pngs.push(await renderCalibrationPagePng(page.letter, page.rotationDeg, qrBase64));
  }

  return pngs;
}

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

export async function generateTestStickerPngs(
  options: StickerPdfOptions = {}
): Promise<Buffer[]> {
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

  return generateStickerRollPngs(entries, options);
}
