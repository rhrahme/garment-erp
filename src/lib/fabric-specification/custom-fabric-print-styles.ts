/**
 * Print CSS for custom / one-off fabric filing A4
 * (/custom-fabrics/[id]/print).
 *
 * Same A4 invariants as receiving sheets: portrait 12mm, width 100%,
 * Helvetica/Arial, no transform/zoom / max-w shrink traps.
 * Top-right swatch square is exactly 5cm x 5cm for a physical cut.
 */
export const CUSTOM_FABRIC_FILING_PRINT_CSS = `
  @media screen {
    .custom-fabric-filing-print .print-a4-sheet {
      width: 186mm;
      max-width: 100%;
      margin-left: auto;
      margin-right: auto;
      box-sizing: border-box;
      min-height: 273mm;
      border: 1px solid #e2e8f0;
      padding: 8mm;
      background: white;
    }
  }

  @media print {
    @page {
      size: A4 portrait;
      margin: 12mm;
    }
    html {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: white !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
      background: white !important;
      transform: none !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .custom-fabric-filing-print,
    .custom-fabric-filing-print .print-a4-sheet {
      height: auto !important;
      max-height: none !important;
      width: 100% !important;
      max-width: none !important;
      overflow: visible !important;
      transform: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      box-sizing: border-box !important;
    }
    .no-print {
      display: none !important;
    }
  }

  .custom-fabric-filing-print {
    font-family: Helvetica, Arial, sans-serif;
    color: #0f172a;
  }

  .custom-fabric-filing-print .print-a4-sheet {
    position: relative;
    box-sizing: border-box;
  }

  .custom-fabric-filing-print .filing-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12pt;
    margin-bottom: 14pt;
  }

  .custom-fabric-filing-print .filing-title-block {
    flex: 1 1 auto;
    min-width: 0;
    padding-right: 8pt;
  }

  .custom-fabric-filing-print .filing-eyebrow {
    margin: 0 0 4pt;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #64748b;
  }

  .custom-fabric-filing-print .filing-fabric-number {
    margin: 0;
    font-size: 18pt;
    font-weight: 700;
    letter-spacing: 0.02em;
    line-height: 1.2;
  }

  .custom-fabric-filing-print .filing-description {
    margin: 6pt 0 0;
    font-size: 12pt;
    line-height: 1.35;
  }

  .custom-fabric-filing-print .swatch-square {
    flex: 0 0 auto;
    width: 5cm;
    height: 5cm;
    box-sizing: border-box;
    border: 1.5pt dashed #64748b;
    background: white;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 4pt;
  }

  .custom-fabric-filing-print .swatch-square-label {
    font-size: 8pt;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #94a3b8;
    line-height: 1.3;
  }

  .custom-fabric-filing-print .filing-fields {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 11pt;
    line-height: 1.4;
    font-family: Helvetica, Arial, sans-serif;
  }

  .custom-fabric-filing-print .filing-fields th,
  .custom-fabric-filing-print .filing-fields td {
    border-bottom: 0.5pt solid #cbd5e1;
    padding: 7pt 6pt 7pt 0;
    vertical-align: top;
    text-align: left;
  }

  .custom-fabric-filing-print .filing-fields th {
    width: 32%;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #64748b;
  }

  .custom-fabric-filing-print .filing-fields td {
    width: 68%;
    font-size: 11pt;
    color: #0f172a;
  }

  .custom-fabric-filing-print .filing-footer {
    margin-top: 18pt;
    font-size: 9pt;
    color: #64748b;
    line-height: 1.35;
  }
`;
