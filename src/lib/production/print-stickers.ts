import {
  readLabelRotation,
  readLabelScalePct,
  type LabelPrintMode,
  type LabelScalePct,
} from "@/lib/production/label-printer-settings";

export type StickerPdfSheet = "fabric-cuts" | "pieces" | "print-pack" | "test" | "calibration";

export const STICKER_PRINT_HEADERS_HINT_KEY = "sticker-print-headers-hint-seen";

/** Chrome/Edge add date, title, URL, and page numbers — not removable via CSS. */
export const STICKER_PRINT_HEADERS_HINT =
  'In the print dialog, open More settings and turn OFF "Headers and footers". Browsers add date, URL, and page numbers otherwise — the app cannot remove them.';

export function rememberStickerPrintHeadersHint(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STICKER_PRINT_HEADERS_HINT_KEY, "1");
}

export type StickerPdfRequest = {
  orderId: string;
  sheet?: StickerPdfSheet;
  po?: string;
  poId?: string;
  /** When set, only these sticker codes are included in the PDF. */
  codes?: string[];
  /** Print mode: "printer-match" (default) or geometric 0/90/180/270. */
  rotationDeg?: LabelPrintMode;
  /** Content scale (100/125/150). Defaults to saved printer setting. */
  scalePct?: LabelScalePct;
};

export type StickerDownloadResult = {
  ok: boolean;
  filename?: string;
};

function resolveRotationDeg(request: StickerPdfRequest): LabelPrintMode {
  return request.rotationDeg ?? readLabelRotation();
}

function resolveScalePct(request: StickerPdfRequest): LabelScalePct {
  return request.scalePct ?? readLabelScalePct();
}

function buildStickerAssetUrl(request: StickerPdfRequest, format: "pdf" | "png"): string {
  const { orderId, sheet = "pieces", po, poId, codes } = request;
  const params = new URLSearchParams({ sheet });
  if (po) params.set("po", po);
  if (poId) params.set("po_id", poId);
  if (codes && codes.length > 0) params.set("codes", codes.join(","));
  params.set("rotation", String(resolveRotationDeg(request)));
  params.set("scale", String(resolveScalePct(request)));
  return `/api/sales-orders/${orderId}/stickers/${format}?${params.toString()}`;
}

function buildStickerPdfUrl(request: StickerPdfRequest): string {
  return buildStickerAssetUrl(request, "pdf");
}

function buildStickerPngUrl(request: StickerPdfRequest): string {
  return buildStickerAssetUrl(request, "png");
}

async function fetchStickerAsset(request: StickerPdfRequest, format: "pdf" | "png"): Promise<Response> {
  const { orderId, sheet = "pieces", po, poId, codes } = request;
  const rotationDeg = resolveRotationDeg(request);
  const scalePct = resolveScalePct(request);
  const url = `/api/sales-orders/${orderId}/stickers/${format}`;

  if (codes && codes.length > 0) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheet,
        po: po ?? null,
        po_id: poId ?? null,
        codes,
        rotation: rotationDeg,
        scale: scalePct,
      }),
      cache: "no-store",
    });
  }

  return fetch(buildStickerAssetUrl(request, format), { cache: "no-store" });
}

async function fetchStickerPdf(request: StickerPdfRequest): Promise<Response> {
  return fetchStickerAsset(request, "pdf");
}

async function fetchStickerPng(request: StickerPdfRequest): Promise<Response> {
  return fetchStickerAsset(request, "png");
}

function pdfFilename(orderId: string, sheet: StickerPdfSheet): string {
  if (sheet === "calibration") return "sticker-rotation-calibration.pdf";
  if (sheet === "test") return "sticker-test.pdf";
  return `stickers-${orderId}-${sheet}.pdf`;
}

function pngFilename(orderId: string, sheet: StickerPdfSheet, multi = false): string {
  if (sheet === "calibration") return multi ? "sticker-calibration.zip" : "sticker-calibration-A.png";
  if (sheet === "test") return multi ? "sticker-test.zip" : "sticker-test-1.png";
  return multi ? `stickers-${orderId}-${sheet}.zip` : `stickers-${orderId}-${sheet}.png`;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/**
 * Fetch server-generated roll PDF, save to Downloads, and return the filename
 * so the UI can show platform-specific print instructions (Preview / Edge).
 *
 * Browser iframe/window.print() is intentionally NOT used — Mac/Windows print
 * dialogs default to A4/Letter and show a solid-black preview for 51×102 mm PDFs.
 */
export async function downloadAndPrintStickerPdf(
  request: StickerPdfRequest,
  onAfterDownload?: () => void
): Promise<StickerDownloadResult> {
  const sheet = request.sheet ?? "pieces";

  try {
    const res = await fetchStickerPdf(request);
    if (!res.ok) {
      console.error("Sticker PDF request failed:", res.status);
      return { ok: false };
    }

    const blob = await res.blob();
    const filename = pdfFilename(request.orderId, sheet);
    triggerBlobDownload(blob, filename);
    onAfterDownload?.();
    return { ok: true, filename };
  } catch (error) {
    console.error("Failed to download sticker PDF:", error);
    return { ok: false };
  }
}

/**
 * @deprecated Browser PDF print (iframe/window.print) shows A4/black preview on Mac/Windows.
 * Use downloadAndPrintStickerPdf instead.
 */
export async function printStickerPdf(
  request: StickerPdfRequest,
  onAfterPrint?: () => void
): Promise<boolean> {
  console.warn("printStickerPdf is deprecated; use downloadAndPrintStickerPdf.");
  const result = await downloadAndPrintStickerPdf(request, onAfterPrint);
  return result.ok;
}

/** @deprecated Browser HTML print added date/URL headers — use downloadAndPrintStickerPdf instead. */
export function printStickerLabels(_onAfterPrint?: () => void): void {
  console.warn("printStickerLabels is deprecated; use downloadAndPrintStickerPdf.");
}

/** Fetch sticker PDF and trigger a file download (Preview.app / manual print fallback). */
export async function downloadStickerPdf(request: StickerPdfRequest): Promise<boolean> {
  const result = await downloadAndPrintStickerPdf(request);
  return result.ok;
}

/**
 * Fetch raster sticker PNG(s) — ultimate D550 fallback.
 * Single label → .png; multiple → .zip. Open in Preview.app, print at 100% on 51×102 mm.
 */
export async function downloadStickerPng(request: StickerPdfRequest): Promise<boolean> {
  const sheet = request.sheet ?? "pieces";

  try {
    const res = await fetchStickerPng(request);
    if (!res.ok) {
      console.error("Sticker PNG download failed:", res.status);
      return false;
    }

    const contentType = res.headers.get("Content-Type") ?? "";
    const multi = contentType.includes("zip");
    const blob = await res.blob();
    triggerBlobDownload(blob, pngFilename(request.orderId, sheet, multi));
    return true;
  } catch (error) {
    console.error("Failed to download sticker PNG:", error);
    return false;
  }
}

export { buildStickerPdfUrl, buildStickerPngUrl, pdfFilename, pngFilename };
