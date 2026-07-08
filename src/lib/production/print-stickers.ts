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
 * Print the deterministic 51×102 mm portrait sticker PDF inside a popup via a full-window
 * iframe. Chrome renders the PDF at its own MediaBox (1:1) and iframe.contentWindow.print()
 * prints it with no re-layout, rotation, or offset — unlike the old HTML+PNG @page path.
 * The popup must be opened synchronously from the click handler (openStickerPrintPopup).
 */
function printStickerPdfInPopup(
  pdfBlob: Blob,
  popup: Window,
  onAfterPrint?: () => void
): Promise<{ ok: boolean; reason?: StickerPrintFailureReason }> {
  return new Promise((resolve) => {
    // Create the blob URL in the popup's own context so its PDF iframe can always load it.
    const urlFactory = popup.URL ?? URL;
    const pdfUrl = urlFactory.createObjectURL(pdfBlob);
    let finished = false;

    const finish = (ok: boolean, reason?: StickerPrintFailureReason) => {
      if (finished) return;
      finished = true;
      if (ok) onAfterPrint?.();
      // Keep the popup open on success so the OS print dialog / spooling is never cut off;
      // the user closes it. Revoke the object URL after enough time for spooling.
      window.setTimeout(() => {
        try {
          urlFactory.revokeObjectURL(pdfUrl);
        } catch {
          /* popup already closed */
        }
      }, 120_000);
      resolve({ ok, reason: ok ? undefined : reason ?? "unknown" });
    };

    try {
      const doc = popup.document;
      doc.open();
      doc.write(
        `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><title></title>` +
          `<style>html,body{margin:0;padding:0;height:100%;background:#f8fafc;}` +
          `iframe{border:0;position:fixed;inset:0;width:100%;height:100%;}` +
          `.hint{font-family:system-ui,sans-serif;padding:12px;font-size:13px;color:#334155;}` +
          `</style></head><body>` +
          `<div class="hint">Opening the print dialog… If it does not appear, press Ctrl/Cmd+P.</div>` +
          `</body></html>`
      );
      doc.close();

      const iframe = doc.createElement("iframe");
      iframe.setAttribute("title", "Sticker labels");
      iframe.onload = () => {
        try {
          const win = iframe.contentWindow;
          if (!win) {
            finish(false, "print-blocked");
            return;
          }
          win.focus();
          win.print();
          finish(true);
        } catch {
          finish(false, "print-blocked");
        }
      };
      iframe.onerror = () => finish(false, "image-error");
      iframe.src = pdfUrl;
      doc.body.appendChild(iframe);
    } catch {
      finish(false, "print-blocked");
    }

    // Safety net: if onload never fires (blocked plugin), resolve ok so the popup stays usable.
    window.setTimeout(() => {
      if (!finished) finish(true);
    }, 120_000);
  });
}

function mapFetchErrorToReason(error: unknown): StickerPrintFailureReason {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("unauthorized") || message.includes("401")) return "unauthorized";
  if (message.includes("400")) return "no-labels";
  return "fetch-failed";
}

/**
 * Fetch the deterministic server-generated 51×102 mm portrait sticker PDF and print it in a
 * popup via a full-window iframe. The PDF's MediaBox matches the D550 media exactly, so the
 * browser/driver prints it 1:1 — no rotation, no offset, no clipping. Never calls print() on
 * the parent page.
 *
 * Pass a popup from openStickerPrintPopup() (opened synchronously on click) so blockers allow
 * the window; print() runs inside the popup after the PDF iframe loads.
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
    const result = await printStickerPdfInPopup(pdfBlob, targetPopup, onAfterPrint);
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
