/**
 * Print CSS for employee ID badge cards on A4 (CR80 grid with crop marks).
 * Used by /hr/id-badges/{saudis|expats}/print
 */
export const EMPLOYEE_BADGE_PRINT_CSS = `
  @page {
    size: A4 portrait;
    margin: 8mm;
  }

  @media print {
    html,
    body {
      height: auto !important;
      width: auto !important;
      overflow: visible !important;
      background: white !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    aside,
    header,
    nav,
    .no-print {
      display: none !important;
    }

    .employee-badge-print-root,
    .employee-badge-print-root * {
      box-sizing: border-box;
    }

    .employee-badge-print-root {
      margin: 0 !important;
      padding: 0 !important;
      background: white !important;
    }

    .badge-print-page {
      break-after: page;
      page-break-after: always;
      width: 100%;
    }

    .badge-print-page:last-child {
      break-after: auto;
      page-break-after: auto;
    }

    .badge-print-grid {
      display: grid !important;
      grid-template-columns: repeat(2, 85.6mm);
      grid-template-rows: repeat(5, 54mm);
      gap: 6mm 8mm;
      justify-content: center;
      align-content: start;
    }

    .badge-print-slot {
      position: relative;
      width: 85.6mm;
      height: 54mm;
      overflow: visible;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .badge-card {
      width: 85.6mm;
      height: 54mm;
      border: 0.35mm solid #0f172a !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      overflow: hidden;
    }

    .badge-company-band {
      height: 7mm !important;
      min-height: 7mm !important;
      flex-shrink: 0 !important;
      background: #f1f5f9 !important;
      border-bottom: 0.5mm solid #0f172a !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .badge-company-name {
      color: #0f172a !important;
      font-size: 9px !important;
      font-weight: 700 !important;
      letter-spacing: 0.1em !important;
      line-height: 1 !important;
      white-space: nowrap !important;
    }
  }
`;
