export const COST_HINT_PRINT_CSS = `
  @page {
    size: A4 landscape;
    margin: 10mm;
  }
  @media print {
    html,
    body {
      height: auto !important;
      overflow: visible !important;
      background: white !important;
    }
    .no-print {
      display: none !important;
    }
  }
`;
