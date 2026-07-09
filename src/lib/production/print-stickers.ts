import {
  readLabelRotation,
  readLabelScalePct,
  type LabelPrintMode,
  type LabelScalePct,
} from "@/lib/production/label-printer-settings";
import {
  buildStickerPrintHtml,
  extractPngBlobsFromZip,
  openStickerPrintPopup,
  pngBlobToDataUrl,
  showStickerPrintPopupError,
} from "@/lib/production/sticker-print-html";

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

export type StickerPrintResult = {
  ok: boolean;
  pageCount?: number;
  reason?: StickerPrintFailureReason;
};

export type StickerPrintFailureReason =
  | "popup-blocked"
  | "fetch-failed"
  | "unauthorized"
  | "no-labels"
  | "image-error"
  | "print-blocked"
  | "no-images"
  | "unknown";

function resolveRotationDeg(request: StickerPdfRequest): LabelPrintMode {
  return request.rotationDeg ?? readLabelRotation();
}

function resolveScalePct(request: StickerPdfRequest): LabelScalePct {
  return request.scalePct ?? readLabelScalePct();
}

function buildStickerAssetUrl(
  request: StickerPdfRequest,
  format: "pdf" | "png",
  options: { browserPrint?: boolean; cacheBust?: boolean | string } = {}
): string {
  const { orderId, sheet = "pieces", po, poId, codes } = request;
  const params = new URLSearchParams({ sheet });
  if (po) params.set("po", po);
  if (poId) params.set("po_id", poId);
  if (codes && codes.length > 0) params.set("codes", codes.join(","));
  params.set("rotation", String(resolveRotationDeg(request)));
  params.set("scale", String(resolveScalePct(request)));
  if (options.browserPrint) params.set("browser_print", "1");
  // Cache-busting: guarantees the print popup / preview never reuses a stale rendered asset.
  if (options.cacheBust) {
    params.set("_ts", options.cacheBust === true ? String(Date.now()) : options.cacheBust);
  }
  return `/api/sales-orders/${orderId}/stickers/${format}?${params.toString()}`;
}

function buildStickerPdfUrl(
  request: StickerPdfRequest,
  options: { cacheBust?: boolean | string } = {}
): string {
  return buildStickerAssetUrl(request, "pdf", options);
}

function buildStickerPngUrl(
  request: StickerPdfRequest,
  options: { cacheBust?: boolean | string } = {}
): string {
  return buildStickerAssetUrl(request, "png", options);
}

async function fetchStickerAsset(
  request: StickerPdfRequest,
  format: "pdf" | "png",
  options: { browserPrint?: boolean } = {}
): Promise<Response> {
  const { orderId, sheet = "pieces", po, poId, codes } = request;
  const rotationDeg = resolveRotationDeg(request);
  const scalePct = resolveScalePct(request);
  // Always cache-bust print/download fetches so a stale rendered asset is never reused.
  const cacheBust = String(Date.now());
  const url = `/api/sales-orders/${orderId}/stickers/${format}?_ts=${cacheBust}`;

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
        browser_print: options.browserPrint ?? false,
      }),
      cache: "no-store",
    });
  }

  return fetch(buildStickerAssetUrl(request, format, { ...options, cacheBust }), {
    cache: "no-store",
  });
}

async function fetchStickerPdf(request: StickerPdfRequest): Promise<Response> {
  return fetchStickerAsset(request, "pdf");
}

async function fetchStickerPng(request: StickerPdfRequest, browserPrint = false): Promise<Response> {
  return fetchStickerAsset(request, "png", { browserPrint });
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
 * Write the print document (one bilevel PNG per label, @page = 51×102 mm portrait, margin 0)
 * into the popup and let its boot script auto-print when the images finish loading.
 *
 * Why HTML+PNG and NOT the PDF viewer: Chrome's PDF viewer print dialog defaults Scale to
 * "Fit to printable area", which shrinks the 51×102 label into the D550's small imageable
 * region → the tiny, cornered, text-clipped output the user kept getting. Chrome IGNORES the
 * PDF's /ViewerPreferences /PrintScaling /None on the Windows print path, so that flag never
 * fixed it. Printing an HTML page instead defaults Scale to 100% and honours @page size with
 * margin:0, so the label maps 1:1 onto the media with no shrink, rotation, or offset. The PNG
 * bytes are the EXACT same server raster shown in the preview → preview and print can't diverge.
 */
function writeStickerPrintDocument(
  dataUrls: string[],
  popup: Window,
  mode: LabelPrintMode,
  onAfterPrint?: () => void
): { ok: boolean; reason?: StickerPrintFailureReason } {
  if (dataUrls.length === 0) {
    return { ok: false, reason: "no-images" };
  }

  try {
    popup.document.open();
    popup.document.write(buildStickerPrintHtml(dataUrls, { mode }));
    popup.document.close();
  } catch {
    return { ok: false, reason: "print-blocked" };
  }

  onAfterPrint?.();
  return { ok: true };
}

function mapFetchErrorToReason(error: unknown): StickerPrintFailureReason {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("unauthorized") || message.includes("401")) return "unauthorized";
  if (message.includes("400")) return "no-labels";
  return "fetch-failed";
}

/**
 * Fetch the server-generated bilevel sticker PNG(s) — the EXACT raster the preview shows — and
 * print them from an HTML popup with @page = 51×102 mm portrait, margin 0. HTML print defaults
 * Scale to 100% (unlike the PDF viewer, which defaults to "Fit to printable area" and shrank the
 * label into a corner), so each page maps 1:1 onto the D550 media with no shrink, rotation, or
 * offset. Never calls print() on the parent page.
 *
 * Pass a popup from openStickerPrintPopup() (opened synchronously on click) so blockers allow
 * the window; the popup then receives the print document and auto-prints on image load.
 */
export async function printStickerPngs(
  request: StickerPdfRequest,
  onAfterPrint?: () => void,
  popup?: Window | null
): Promise<StickerPrintResult> {
  const targetPopup = popup ?? openStickerPrintPopup();
  if (!targetPopup) {
    return { ok: false, reason: "popup-blocked" };
  }

  try {
    const res = await fetchStickerPng(request);
    if (res.status === 401) {
      showStickerPrintPopupError(targetPopup, stickerPrintFailureMessage("unauthorized"));
      return { ok: false, reason: "unauthorized" };
    }
    if (res.status === 400) {
      showStickerPrintPopupError(targetPopup, stickerPrintFailureMessage("no-labels"));
      return { ok: false, reason: "no-labels" };
    }
    if (!res.ok) {
      throw new Error(`Sticker PNG request failed: ${res.status}`);
    }

    const contentType = res.headers.get("Content-Type") ?? "";
    const blob = await res.blob();
    const pngBlobs = contentType.includes("zip")
      ? await extractPngBlobsFromZip(blob)
      : [blob];

    if (pngBlobs.length === 0) {
      showStickerPrintPopupError(targetPopup, stickerPrintFailureMessage("no-images"));
      return { ok: false, reason: "no-images" };
    }

    const dataUrls = await Promise.all(pngBlobs.map((png) => pngBlobToDataUrl(png)));
    const result = writeStickerPrintDocument(
      dataUrls,
      targetPopup,
      resolveRotationDeg(request),
      onAfterPrint
    );
    if (!result.ok) {
      showStickerPrintPopupError(
        targetPopup,
        stickerPrintFailureMessage(result.reason ?? "unknown")
      );
      return { ok: false, reason: result.reason };
    }
    return { ok: true, pageCount: dataUrls.length };
  } catch (error) {
    console.error("Failed to print sticker labels:", error);
    const reason = mapFetchErrorToReason(error);
    showStickerPrintPopupError(targetPopup, stickerPrintFailureMessage(reason));
    return { ok: false, reason };
  }
}

export function stickerPrintFailureMessage(reason: StickerPrintFailureReason): string {
  switch (reason) {
    case "popup-blocked":
      return "Popups are blocked — allow popups for this site, then click Print again.";
    case "unauthorized":
      return "Session expired — log in again on erp.hagan.pro, then retry.";
    case "no-labels":
      return "No sticker labels matched your selection.";
    case "print-blocked":
      return "The print dialog was blocked — use the Print labels button in this window.";
    case "image-error":
    case "no-images":
      return "Sticker images failed to load — try Download PNG from the preview, or refresh and retry.";
    case "fetch-failed":
      return "Could not load sticker images from the server — check your connection and try again.";
    default:
      return "Sticker print failed — try Download PNG/PDF from the preview, or refresh and retry.";
  }
}

export { openStickerPrintPopup };

/** @deprecated Use printStickerPngs — kept as alias for existing call sites. */
export async function printStickerPdf(
  request: StickerPdfRequest,
  onAfterPrint?: () => void
): Promise<boolean> {
  const result = await printStickerPngs(request, onAfterPrint);
  return result.ok;
}

/**
 * Fetch server-generated roll PDF and save to Downloads (manual print fallback).
 */
export async function downloadStickerPdf(request: StickerPdfRequest): Promise<boolean> {
  const sheet = request.sheet ?? "pieces";

  try {
    const res = await fetchStickerPdf(request);
    if (!res.ok) {
      console.error("Sticker PDF request failed:", res.status);
      return false;
    }

    const blob = await res.blob();
    triggerBlobDownload(blob, pdfFilename(request.orderId, sheet));
    return true;
  } catch (error) {
    console.error("Failed to download sticker PDF:", error);
    return false;
  }
}

/** @deprecated Use printStickerPngs for direct print or downloadStickerPdf for fallback. */
export async function downloadAndPrintStickerPdf(
  request: StickerPdfRequest,
  onAfterDownload?: () => void
): Promise<{ ok: boolean; filename?: string }> {
  const ok = await downloadStickerPdf(request);
  onAfterDownload?.();
  if (!ok) return { ok: false };
  const sheet = request.sheet ?? "pieces";
  return { ok: true, filename: pdfFilename(request.orderId, sheet) };
}

/** @deprecated Browser HTML print from DOM added headers — use printStickerPngs instead. */
export function printStickerLabels(_onAfterPrint?: () => void): void {
  console.warn("printStickerLabels is deprecated; use printStickerPngs.");
}

/**
 * Fetch raster sticker PNG(s) — manual print fallback.
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

export { buildStickerPdfUrl, buildStickerPngUrl, buildStickerPrintHtml, pdfFilename, pngFilename };
