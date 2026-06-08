import {
  LABEL_STICKER_COLUMN_GAP_MM,
  LABEL_STICKER_LINE_GAP_MM,
  LABEL_STICKER_PADDING_H_MM,
  LABEL_STICKER_PADDING_V_MM,
  LABEL_STICKER_QR_SIZE_MM,
  labelRollHeightCss,
  labelRollSizeCss,
  labelRollWidthCss,
} from "@/lib/production/label-print-config";
import { STICKER_FONT } from "@/lib/production/sticker-typography";

/** Shared @page + @media print rules for 10 × 5 cm thermal roll labels. */
export function stickerPrintStyles(): string {
  const width = labelRollWidthCss();
  const height = labelRollHeightCss();
  const pageSize = labelRollSizeCss();

  return `
    @page {
      size: ${pageSize};
      margin: 0;
    }
    @media print {
      html,
      body {
        width: ${width} !important;
        height: ${height} !important;
        margin: 0 !important;
        padding: 0 !important;
        background: white !important;
        overflow: hidden !important;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      aside,
      header,
      nav,
      .no-print,
      .print-header,
      .print-sheet > :not(.sticker-print-zone),
      .print-pack-stickers > :not(.sticker-print-zone) {
        display: none !important;
      }
      body * {
        visibility: hidden !important;
      }
      .sticker-print-zone,
      .sticker-print-zone * {
        visibility: visible !important;
      }
      .sticker-print-zone {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: ${width} !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        z-index: 2147483647 !important;
        background: white !important;
      }
      .sticker-roll {
        display: block !important;
        margin: 0 !important;
        padding: 0 !important;
        width: ${width} !important;
        height: ${height} !important;
      }
      .sticker-page {
        width: ${width} !important;
        height: ${height} !important;
        min-width: ${width} !important;
        min-height: ${height} !important;
        max-width: ${width} !important;
        max-height: ${height} !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        page-break-after: always !important;
        break-after: page !important;
        box-sizing: border-box !important;
      }
      .sticker-page:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      .sticker-cell {
        width: ${width} !important;
        height: ${height} !important;
        min-width: ${width} !important;
        min-height: ${height} !important;
        max-width: ${width} !important;
        max-height: ${height} !important;
        box-sizing: border-box !important;
        border: none !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        overflow: hidden !important;
        background: white !important;
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        padding: ${LABEL_STICKER_PADDING_V_MM}mm ${LABEL_STICKER_PADDING_H_MM}mm !important;
      }
      .sticker-cell-body {
        flex: 1 !important;
        min-width: 0 !important;
        margin-left: ${LABEL_STICKER_COLUMN_GAP_MM}mm !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: center !important;
        gap: ${LABEL_STICKER_LINE_GAP_MM}mm !important;
      }
      .sticker-header-row {
        display: flex !important;
        justify-content: space-between !important;
        align-items: baseline !important;
        gap: 1mm !important;
        flex-shrink: 0 !important;
      }
      .sticker-cell,
      .sticker-cell * {
        color: #2a2a2a !important;
        font-family: ${STICKER_FONT} !important;
        font-weight: 300 !important;
        font-synthesis: none !important;
        -webkit-font-smoothing: none !important;
        text-rendering: geometricPrecision !important;
      }
      .sticker-line {
        margin: 0 !important;
        padding: 0 !important;
        line-height: 1.15 !important;
        font-weight: 300 !important;
        font-synthesis: none !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
      .sticker-line-client {
        font-size: 3.6mm !important;
        letter-spacing: 0.04mm !important;
        font-variant-numeric: tabular-nums !important;
      }
      .sticker-line-client-name {
        font-size: 3.4mm !important;
      }
      .sticker-line-code {
        font-size: 3.3mm !important;
        letter-spacing: 0.04mm !important;
        font-variant-numeric: tabular-nums !important;
      }
      .sticker-line-fabric {
        font-size: 3.2mm !important;
      }
      .sticker-line-cut-qty {
        font-size: 3.8mm !important;
        letter-spacing: 0.14mm !important;
        font-variant-numeric: tabular-nums !important;
        flex-shrink: 0 !important;
      }
      .sticker-line-cut-labels,
      .sticker-line-piece {
        font-size: 3.2mm !important;
        flex-shrink: 0 !important;
      }
      .sticker-line-spec {
        font-size: 3mm !important;
      }
      .sticker-line-piece {
        letter-spacing: 0.05mm !important;
      }
      .sticker-role-mark,
      .sticker-batch-mark {
        font-size: 2.8mm !important;
        letter-spacing: 0.02mm !important;
        line-height: 1.1 !important;
        font-weight: 300 !important;
        font-synthesis: none !important;
        white-space: nowrap !important;
      }
      .sticker-batch-mark {
        letter-spacing: 0.04mm !important;
        font-variant-numeric: tabular-nums !important;
      }
      .sticker-cell img {
        width: ${LABEL_STICKER_QR_SIZE_MM}mm !important;
        height: ${LABEL_STICKER_QR_SIZE_MM}mm !important;
        flex-shrink: 0 !important;
        display: block !important;
        print-color-adjust: exact !important;
        -webkit-print-color-adjust: exact !important;
      }
    }
  `;
}
