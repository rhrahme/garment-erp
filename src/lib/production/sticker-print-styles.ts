import { labelRollSizeCss } from "@/lib/production/label-print-config";

/** @page rules on sticker pages; @media print hides everything (print uses popup PNGs). */
export function stickerPrintStyles(): string {
  const pageSize = labelRollSizeCss();

  return `
    @page {
      size: ${pageSize};
      margin: 0;
    }
    @media print {
      /* Stickers print via popup PNG document — block accidental Cmd+P on this page. */
      html,
      body,
      body * {
        display: none !important;
        visibility: hidden !important;
      }
    }
  `;
}
