import {
  readLabelRotation,
  readLabelScalePct,
  type LabelPrintMode,
  type LabelScalePct,
} from "@/lib/production/label-printer-settings";
import {
  buildStickerPrintHtml,
  extractPngBlobsFromZip,
  prepareBrowserPrintDataUrl,
  waitForDocumentImages,
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

async function fetchStickerPngBlobs(request: StickerPdfRequest): Promise<Blob[]> {
  const res = await fetchStickerPng(request);
  if (!res.ok) {
    throw new Error(`Sticker PNG request failed: ${res.status}`);
  }

  const contentType = res.headers.get("Content-Type") ?? "";
  const blob = await res.blob();

  if (contentType.includes("zip")) {
    const pngs = await extractPngBlobsFromZip(blob);
    if (pngs.length === 0) throw new Error("Sticker ZIP contained no PNG files");
    return pngs;
  }

  return [blob];
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
 * Open a dedicated popup with inline base64 PNGs and print from that window.
 * Uses a blob: document URL (not about:blank) so Chrome footers show a blank
 * title instead of "about:blank" if headers are left on.
 */
function printStickerImageDataUrls(
  imageDataUrls: string[],
  mode: LabelPrintMode,
  onAfterPrint?: () => void
): Promise<boolean> {
  return new Promise((resolve) => {
    const html = buildStickerPrintHtml(imageDataUrls, { mode });
    const docBlob = new Blob([html], { type: "text/html;charset=utf-8" });
    const docUrl = URL.createObjectURL(docBlob);

    const popup = window.open(docUrl, "sticker-print", "popup,width=480,height=640");
    if (!popup) {
      URL.revokeObjectURL(docUrl);
      resolve(false);
      return;
    }

    let finished = false;

    const cleanup = () => {
      window.setTimeout(() => {
        try {
          popup.close();
        } catch {
          /* already closed */
        }
        URL.revokeObjectURL(docUrl);
      }, 1000);
    };

    const finish = (ok: boolean) => {
      if (finished) return;
      finished = true;
      if (ok) onAfterPrint?.();
      cleanup();
      resolve(ok);
    };

    const runPrint = () => {
      void waitForDocumentImages(popup.document)
        .then(() => {
          try {
            popup.focus();
            popup.print();
          } catch {
            finish(false);
            return;
          }

          popup.addEventListener("afterprint", () => finish(true), { once: true });
          window.setTimeout(() => {
            if (!finished) finish(true);
          }, 120_000);
        })
        .catch(() => finish(false));
    };

    if (popup.document.readyState === "complete") {
      runPrint();
    } else {
      popup.addEventListener("load", runPrint, { once: true });
      popup.addEventListener("error", () => finish(false), { once: true });
    }
  });
}

/**
 * Fetch server-generated bilevel PNG(s) and open the system print dialog in a popup.
 * Printer-match mode pre-rotates to landscape 102×51 mm for D550 browser print.
 * Never calls print() on the parent page.
 */
export async function printStickerPngs(
  request: StickerPdfRequest,
  onAfterPrint?: () => void
): Promise<StickerPrintResult> {
  try {
    const mode = resolveRotationDeg(request);
    const pngBlobs = await fetchStickerPngBlobs(request);
    const imageDataUrls = await Promise.all(
      pngBlobs.map((blob) => prepareBrowserPrintDataUrl(blob, mode))
    );
    const ok = await printStickerImageDataUrls(imageDataUrls, mode, onAfterPrint);
    return { ok, pageCount: pngBlobs.length };
  } catch (error) {
    console.error("Failed to print sticker PNGs:", error);
    return { ok: false };
  }
}

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
