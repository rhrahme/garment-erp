import {
  readLabelRotation,
  readLabelScalePct,
  type LabelPrintMode,
  type LabelScalePct,
} from "@/lib/production/label-printer-settings";
import {
  buildStickerPrintHtml,
  openStickerPrintPopup,
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
 * Print the deterministic 51×102 mm portrait sticker PDF by loading it as the TOP-LEVEL
 * document of the popup window (popup.location = blob PDF URL). This is critical: Chromium
 * only honours the PDF's /ViewerPreferences /PrintScaling /None when the PDF is the top-level
 * document in its PDF viewer. When a PDF is embedded in an <iframe> and printed via JS, Chrome
 * ignores the flag and falls back to "fit to printable area" → the tiny, cornered output.
 *
 * The popup shows Chrome's PDF viewer at actual size; a best-effort popup.print() is attempted
 * (usually blocked cross-origin for the PDF viewer), otherwise the user prints with Ctrl/Cmd+P
 * — either way it prints at actual size because the flag is honoured at the top level.
 *
 * The popup must be opened synchronously from the click handler (openStickerPrintPopup).
 */
function printStickerPdfTopLevel(
  pdfBlob: Blob,
  popup: Window,
  onAfterPrint?: () => void
): { ok: boolean; reason?: StickerPrintFailureReason } {
  // Create the blob URL in the OPENER context so it stays valid after the popup navigates.
  const pdfUrl = URL.createObjectURL(pdfBlob);

  try {
    // Navigate the popup itself to the PDF → top-level PDF viewer (flag honoured).
    popup.location.href = pdfUrl;
  } catch {
    try {
      URL.revokeObjectURL(pdfUrl);
    } catch {
      /* noop */
    }
    return { ok: false, reason: "print-blocked" };
  }

  // Best-effort auto-print once the viewer has had time to load. Chrome's PDF viewer runs in
  // an extension origin, so popup.print() typically throws cross-origin — that's fine, the PDF
  // is on screen for the user to print manually.
  window.setTimeout(() => {
    try {
      popup.focus();
      popup.print();
    } catch {
      /* cross-origin PDF viewer — user prints with Ctrl/Cmd+P */
    }
  }, 1200);

  // Revoke well after the user has had time to print/spool.
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(pdfUrl);
    } catch {
      /* noop */
    }
  }, 600_000);

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
 * Fetch the deterministic server-generated 51×102 mm portrait sticker PDF and open it as the
 * TOP-LEVEL document of the popup window so Chromium honours /PrintScaling /None and prints at
 * actual size (1:1) — no fit-to-printable shrink, rotation, or offset. Never calls print() on
 * the parent page.
 *
 * Pass a popup from openStickerPrintPopup() (opened synchronously on click) so blockers allow
 * the window; the popup then navigates to the PDF and prints at the top level.
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
    const res = await fetchStickerPdf(request);
    if (res.status === 401) {
      showStickerPrintPopupError(targetPopup, stickerPrintFailureMessage("unauthorized"));
      return { ok: false, reason: "unauthorized" };
    }
    if (res.status === 400) {
      showStickerPrintPopupError(targetPopup, stickerPrintFailureMessage("no-labels"));
      return { ok: false, reason: "no-labels" };
    }
    if (!res.ok) {
      throw new Error(`Sticker PDF request failed: ${res.status}`);
    }

    const pdfBlob = await res.blob();
    const result = printStickerPdfTopLevel(pdfBlob, targetPopup, onAfterPrint);
    if (!result.ok) {
      showStickerPrintPopupError(
        targetPopup,
        stickerPrintFailureMessage(result.reason ?? "unknown")
      );
    }
    return { ok: result.ok, reason: result.reason };
  } catch (error) {
    console.error("Failed to print sticker PDF:", error);
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
