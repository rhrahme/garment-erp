import { stickerPrintStyles } from "@/lib/production/sticker-print-styles";

export const STICKER_PRINT_HEADERS_HINT_KEY = "sticker-print-headers-hint-seen";

/** Chrome/Edge add date, title, URL, and page numbers — not removable via CSS. */
export const STICKER_PRINT_HEADERS_HINT =
  "In the print dialog, open More settings and turn OFF \"Headers and footers\". Browsers add date, URL, and page numbers otherwise — the app cannot remove them.";

function collectStickerHtml(): string | null {
  const zones = document.querySelectorAll<HTMLElement>(".sticker-print-zone");
  if (zones.length === 0) return null;
  return Array.from(zones)
    .map((zone) => zone.innerHTML)
    .join("");
}

function waitForImages(doc: Document, onReady: () => void) {
  const imgs = Array.from(doc.querySelectorAll<HTMLImageElement>("img"));
  if (imgs.length === 0) {
    window.setTimeout(onReady, 200);
    return;
  }

  let pending = imgs.length;
  const check = () => {
    pending -= 1;
    if (pending <= 0) window.setTimeout(onReady, 200);
  };

  for (const img of imgs) {
    if (img.complete && img.naturalWidth > 0) {
      check();
    } else {
      img.addEventListener("load", check, { once: true });
      img.addEventListener("error", check, { once: true });
    }
  }
}

/**
 * Open a minimal popup with only sticker markup and print from there.
 * Short document title and zero margins reduce clutter; headers/footers still require the print dialog setting.
 */
export function printStickersInPopup(onAfterPrint?: () => void): boolean {
  const stickerHtml = collectStickerHtml();
  if (!stickerHtml) return false;

  const popup = window.open("", "sticker-print", "noopener,noreferrer,width=520,height=400");
  if (!popup) return false;

  const styles = stickerPrintStyles();
  popup.document.open();
  popup.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title> </title>
  <style>
    html, body { margin: 0; padding: 0; background: #fff; }
    ${styles}
  </style>
</head>
<body>
  <div class="sticker-print-zone">${stickerHtml}</div>
</body>
</html>`);
  popup.document.close();

  const finish = () => {
    onAfterPrint?.();
    popup.close();
  };

  popup.addEventListener("afterprint", finish, { once: true });

  waitForImages(popup.document, () => {
    popup.focus();
    popup.print();
  });

  return true;
}

export function printStickerLabels(onAfterPrint?: () => void): void {
  if (printStickersInPopup(onAfterPrint)) return;

  if (onAfterPrint) {
    window.addEventListener("afterprint", onAfterPrint, { once: true });
  }
  window.print();
}

export function hasSeenStickerPrintHeadersHint(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STICKER_PRINT_HEADERS_HINT_KEY) === "1";
}

export function rememberStickerPrintHeadersHint(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STICKER_PRINT_HEADERS_HINT_KEY, "1");
}
