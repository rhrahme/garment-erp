import {
  LABEL_MATCH_PRINTER_PAGE_H_MM,
  LABEL_MATCH_PRINTER_PAGE_W_MM,
} from "@/lib/production/label-print-config";

/** Driver media for D550 direct browser print (@page size). */
export const STICKER_PRINT_PAGE_W_MM = LABEL_MATCH_PRINTER_PAGE_W_MM;
export const STICKER_PRINT_PAGE_H_MM = LABEL_MATCH_PRINTER_PAGE_H_MM;

export const STICKER_PRINT_PAPER_NOTE =
  "Set paper to 51×102 mm in the printer driver if the preview looks wrong.";

/**
 * Build a minimal print document: one bilevel PNG per page at exact roll size.
 * Browsers rasterize <img> predictably; PDF embeds often default to A4 with a black preview.
 */
export function buildStickerPrintHtml(imageSrcs: string[]): string {
  const pageW = STICKER_PRINT_PAGE_W_MM;
  const pageH = STICKER_PRINT_PAGE_H_MM;
  const pages = imageSrcs
    .map(
      (src) =>
        `<div class="label-page"><img src="${src}" alt="" width="100%" height="100%" /></div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
@page {
  size: ${pageW}mm ${pageH}mm;
  margin: 0;
}
html, body {
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
}
.label-page:last-child {
  page-break-after: auto;
  break-after: auto;
}
.label-page img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
}
@media print {
  html, body {
    margin: 0;
    padding: 0;
  }
}
</style>
</head>
<body>
${pages}
</body>
</html>`;
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
