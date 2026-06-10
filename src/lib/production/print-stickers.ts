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

/**
 * Fetch server-generated roll PDF and open the system print dialog.
 * PDF pages use the saved label rotation (default 0° — 50×100 mm portrait upright, one label per page).
 */
export async function printStickerPdf(
  request: StickerPdfRequest,
  onAfterPrint?: () => void
): Promise<boolean> {
  const sheet = request.sheet ?? "pieces";

  try {
    const res = await fetchStickerPdf(request);
    if (!res.ok) {
      console.error("Sticker PDF request failed:", res.status);
      return false;
    }

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const filename = pdfFilename(request.orderId, sheet);

    let finished = false;

    const cleanup = (iframe?: HTMLIFrameElement, printWindow?: Window | null) => {
      window.setTimeout(() => {
        iframe?.remove();
        if (printWindow && !printWindow.closed) printWindow.close();
        URL.revokeObjectURL(objectUrl);
      }, 1000);
    };

    const finishAfterPrint = (iframe?: HTMLIFrameElement, printWindow?: Window | null) => {
      if (finished) return;
      finished = true;
      onAfterPrint?.();
      cleanup(iframe, printWindow);
    };

    const triggerPrint = (targetWindow: Window, iframe?: HTMLIFrameElement, printWindow?: Window | null) => {
      try {
        targetWindow.focus();
        targetWindow.print();
      } catch {
        cleanup(iframe, printWindow);
        return false;
      }

      targetWindow.addEventListener("afterprint", () => finishAfterPrint(iframe, printWindow), { once: true });
      // Cleanup only — do not mark lines printed on timeout (dialog may still be open).
      window.setTimeout(() => cleanup(iframe, printWindow), 120_000);
      return true;
    };

    // Safari/Chrome often print BLANK PDFs from a zero-size iframe — use non-zero off-screen iframe.
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", filename);
    iframe.style.position = "fixed";
    iframe.style.left = "-10000px";
    iframe.style.top = "0";
    iframe.style.width = "800px";
    iframe.style.height = "600px";
    iframe.style.border = "0";
    iframe.style.margin = "0";
    iframe.style.padding = "0";
    iframe.src = objectUrl;

    iframe.onload = () => {
      const contentWindow = iframe.contentWindow;
      if (contentWindow && triggerPrint(contentWindow, iframe)) return;

      // Fallback: new tab (works when iframe print is blocked or blank).
      const printWindow = window.open(objectUrl, "_blank");
      if (!printWindow) {
        cleanup(iframe);
        return;
      }
      printWindow.onload = () => {
        triggerPrint(printWindow, iframe, printWindow);
      };
    };

    document.body.appendChild(iframe);
    return true;
  } catch (error) {
    console.error("Failed to print sticker PDF:", error);
    return false;
  }
}

/** @deprecated Browser HTML print added date/URL headers — use printStickerPdf instead. */
export function printStickerLabels(_onAfterPrint?: () => void): void {
  console.warn("printStickerLabels is deprecated; use printStickerPdf.");
}

/** Fetch sticker PDF and trigger a file download (Preview.app / manual print fallback). */
export async function downloadStickerPdf(request: StickerPdfRequest): Promise<boolean> {
  const sheet = request.sheet ?? "pieces";

  try {
    const res = await fetchStickerPdf(request);
    if (!res.ok) {
      console.error("Sticker PDF download failed:", res.status);
      return false;
    }

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = pdfFilename(request.orderId, sheet);
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return true;
  } catch (error) {
    console.error("Failed to download sticker PDF:", error);
    return false;
  }
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
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = pngFilename(request.orderId, sheet, multi);
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return true;
  } catch (error) {
    console.error("Failed to download sticker PNG:", error);
    return false;
  }
}

export { buildStickerPdfUrl, buildStickerPngUrl, pdfFilename, pngFilename };
