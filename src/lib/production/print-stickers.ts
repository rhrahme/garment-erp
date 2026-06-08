export type StickerPdfSheet = "fabric-cuts" | "pieces" | "print-pack" | "test";

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
};

function buildStickerPdfUrl({ orderId, sheet = "pieces", po, poId, codes }: StickerPdfRequest): string {
  const params = new URLSearchParams({ sheet });
  if (po) params.set("po", po);
  if (poId) params.set("po_id", poId);
  if (codes && codes.length > 0) params.set("codes", codes.join(","));
  return `/api/sales-orders/${orderId}/stickers/pdf?${params.toString()}`;
}

async function fetchStickerPdf(request: StickerPdfRequest): Promise<Response> {
  const { orderId, sheet = "pieces", po, poId, codes } = request;
  const url = `/api/sales-orders/${orderId}/stickers/pdf`;

  if (codes && codes.length > 0) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheet,
        po: po ?? null,
        po_id: poId ?? null,
        codes,
      }),
      cache: "no-store",
    });
  }

  return fetch(buildStickerPdfUrl(request), { cache: "no-store" });
}

function pdfFilename(orderId: string, sheet: StickerPdfSheet): string {
  if (sheet === "test") return "sticker-test.pdf";
  return `stickers-${orderId}-${sheet}.pdf`;
}

/**
 * Fetch server-generated roll PDF and open the system print dialog.
 * PDF pages are 102×51 mm landscape — matches physical label; no CTM rotation (thermal-safe).
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
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = objectUrl;

    const cleanup = () => {
      window.setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(objectUrl);
      }, 1000);
    };

    const finish = () => {
      onAfterPrint?.();
      cleanup();
    };

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.open(objectUrl, "_blank");
        finish();
        return;
      }

      iframe.contentWindow?.addEventListener("afterprint", finish, { once: true });
      window.setTimeout(finish, 60_000);
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

export { buildStickerPdfUrl, pdfFilename };
