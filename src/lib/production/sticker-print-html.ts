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
import { STICKER_RASTER_DPI } from "@/lib/production/label-print-config";

/** Driver media for D550 PDF / fallback portrait browser print. */
export const STICKER_PRINT_PORTRAIT_W_MM = LABEL_MATCH_PRINTER_PAGE_W_MM;
export const STICKER_PRINT_PORTRAIT_H_MM = LABEL_MATCH_PRINTER_PAGE_H_MM;

/**
 * Browser direct print on D550: send a LANDSCAPE 102×51 raster (the portrait design pre-rotated
 * 90° CCW) with a landscape @page. The D550 driver applies a FIXED 90° CW rotation to every page
 * (verified pixel-for-pixel against IMG_9251: an upright portrait page prints sideways and clips
 * the tall content). Emitting landscape lets that turn cancel to an upright 51×102 portrait label.
 */
export const STICKER_PRINT_LANDSCAPE_W_MM = LABEL_MATCH_PRINTER_PAGE_H_MM;
export const STICKER_PRINT_LANDSCAPE_H_MM = LABEL_MATCH_PRINTER_PAGE_W_MM;

export const STICKER_PRINT_PAPER_NOTE =
  "Paper: 51×102 mm (2\"×4\") portrait in the D550 driver. Scale 100% — do NOT use Fit to page / Fit to printable area.";

export const STICKER_PRINT_SCALE_NOTE =
  "Print opens the label image(s) in a new window and auto-opens the system dialog. If it does not print automatically, press Ctrl/Cmd+P. Keep Scale = 100% (Default, NOT Fit to printable area) and Margins = None. Turn OFF Headers and footers.";

/**
 * The D550 Windows driver's own Printing Preferences can silently override the browser and
 * shrink/offset labels. This must be checked once on the print PC.
 */
export const STICKER_PRINT_DRIVER_NOTE =
  "One-time Windows check: Control Panel → Devices and Printers → D550 → Printing preferences → set Stock/Media = 51×102 mm (2\"×4\") and Scaling/Zoom = 100% (None). A wrong driver stock makes even actual-size labels print tiny in a corner.";

export type StickerPrintHtmlOptions = {
  mode?: LabelPrintMode;
};

const STICKER_PRINT_POPUP_FEATURES = "popup,width=480,height=640";

/** Open synchronously from a click handler so popup blockers allow the print window. */
export function openStickerPrintPopup(): Window | null {
  const popup = window.open("", "sticker-print", STICKER_PRINT_POPUP_FEATURES);
  if (!popup) return null;
  try {
    popup.document.open();
    popup.document.write(buildStickerPrintLoadingHtml());
    popup.document.close();
  } catch {
    popup.close();
    return null;
  }
  return popup;
}

export function showStickerPrintPopupError(popup: Window, message: string): void {
  try {
    popup.document.open();
    popup.document.write(buildStickerPrintErrorHtml(message));
    popup.document.close();
  } catch {
    /* popup may already be closed */
  }
}

export function buildStickerPrintLoadingHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #f8fafc;
  color: #334155;
}
p { margin: 0; font-size: 14px; }
</style>
</head>
<body><p>Preparing labels for print…</p></body>
</html>`;
}

export function buildStickerPrintErrorHtml(message: string): string {
  const safe = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  padding: 24px;
  background: #fef2f2;
  color: #991b1b;
}
h1 { font-size: 16px; margin: 0 0 8px; }
p { margin: 0; font-size: 14px; line-height: 1.5; }
</style>
</head>
<body>
<h1>Sticker print failed</h1>
<p>${safe}</p>
<p style="margin-top:12px;color:#475569">Close this window, return to the order page, and try Download PNG/PDF if print keeps failing.</p>
</body>
</html>`;
}

/**
 * Auto-print boot script. Runs inside the popup.
 *
 * CRITICAL: this document is injected via popup.document.open()/write()/close() into a popup
 * that already fired its window "load" event (for the "Preparing…" page). After a document.write
 * cycle Chrome does NOT re-fire "load", so the old code — which waited on window "load" whenever
 * readyState !== "complete" — never ran autoPrint and the dialog never opened. Instead we run
 * immediately (this <script> sits at the end of <body>, so every <img> already exists), wait for
 * the label image(s) to fully decode (img.decode(), with an onload fallback and a hard safety
 * timeout so a stuck image can never block printing), then focus + print. A visible Print button
 * (window.__printStickerLabels) is always available as a manual fallback / retrigger.
 */
const STICKER_PRINT_BOOT_SCRIPT = `<script>
(function () {
  function notifyParent(ok, reason) {
    try {
      if (window.opener) {
        window.opener.postMessage({ type: "sticker-print-finished", ok: ok, reason: reason || null }, "*");
      }
    } catch (e) {}
  }

  var printed = false;
  function triggerPrint() {
    if (printed) return;
    printed = true;
    try {
      window.focus();
    } catch (e) {}
    try {
      window.print();
      window.addEventListener("afterprint", function () { notifyParent(true); }, { once: true });
    } catch (e) {
      printed = false; // allow the manual button to retry
      notifyParent(false, "print-blocked");
    }
  }

  // Manual fallback button always works: it forces a fresh print() on a real user gesture.
  window.__printStickerLabels = function () {
    printed = false;
    triggerPrint();
  };

  function waitForImages() {
    var imgs = Array.prototype.slice.call(document.querySelectorAll("img.label-raster"));
    if (imgs.length === 0) {
      notifyParent(false, "no-images");
      return Promise.resolve();
    }
    var waits = imgs.map(function (img) {
      // decode() resolves once the image is fully decoded and paintable (works for data: URIs).
      if (typeof img.decode === "function") {
        return img.decode().then(function () {}, function () {});
      }
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(function (resolve) {
        img.addEventListener("load", function () { resolve(); }, { once: true });
        img.addEventListener("error", function () { resolve(); }, { once: true });
      });
    });
    return Promise.all(waits);
  }

  function boot() {
    var done = false;
    function go() {
      if (done) return;
      done = true;
      // A tick after decode lets layout settle before the print snapshot.
      window.setTimeout(triggerPrint, 60);
    }
    // Hard safety net: never let a stuck/never-loading image block the dialog.
    window.setTimeout(go, 3000);
    waitForImages().then(go);
  }

  boot();
})();
</script>`;

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
    // Emit a LANDSCAPE 102×51 page whose raster is the portrait design pre-rotated 90° CCW.
    // The D550 driver's fixed 90° CW turn cancels it back to an upright 51×102 portrait label
    // (its media), so nothing is rotated or clipped. @page bytes == preview bytes == PDF bytes.
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
        `<div class="label-page"><img class="label-raster" src="${src}" alt="" width="${imgWpx}" height="${imgHpx}" /></div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
.screen-only {
  font-family: system-ui, sans-serif;
  padding: 16px;
  font-size: 14px;
  color: #334155;
  background: #f8fafc;
}
.screen-only button {
  margin-top: 8px;
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;
}
@media print {
  .screen-only { display: none !important; }
}
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
  object-fit: contain;
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
<div class="screen-only">
  <p><strong>Preparing labels…</strong> the print dialog should open automatically.</p>
  <p>If it doesn't appear, click <strong>Print labels</strong> below (or press Ctrl/Cmd+P). Keep
  Scale = <strong>100%</strong> (not Fit to printable area) and Margins = <strong>None</strong>,
  and select the <strong>D550</strong> label printer.</p>
  <button type="button" onclick="(window.__printStickerLabels || window.print).call(window)">Print labels</button>
</div>
${pages}
${STICKER_PRINT_BOOT_SCRIPT}
</body>
</html>`;
}

/**
 * printer-match rasters are pre-rotated to landscape inside renderStickerPagePng, so no extra
 * rotation is needed here. Always false; kept for legacy callers.
 */
export function browserPrintNeedsLandscapeRotate(_mode: LabelPrintMode): boolean {
  return false;
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

/** @deprecated Server pre-rotates printer-match PNGs — kept for legacy callers only. */
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
  ctx.imageSmoothingEnabled = false;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((3 * Math.PI) / 2);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();
  return canvas.toDataURL("image/png");
}

/** Server sends portrait PNGs sized to the D550 media — no client rotation. */
export async function prepareBrowserPrintDataUrl(
  blob: Blob,
  _mode: LabelPrintMode
): Promise<string> {
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
