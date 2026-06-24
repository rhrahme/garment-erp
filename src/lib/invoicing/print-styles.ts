/** Print overrides when invoice pages render inside the dashboard shell. */
export const INVOICE_PRINT_CSS = `
  @media print {
    @page {
      size: A4 portrait;
      margin: 12mm;
    }
    html,
    body {
      height: auto !important;
      overflow: visible !important;
      background: white !important;
    }
    .flex.h-screen,
    .flex.h-screen > div,
    main {
      height: auto !important;
      overflow: visible !important;
    }
    aside,
    header,
    nav,
    .no-print {
      display: none !important;
    }
    main {
      margin: 0 !important;
      padding: 0 !important;
    }
    .invoice-print-page {
      padding: 0 !important;
    }
    .invoice-document {
      max-width: none !important;
      padding: 0 !important;
      box-shadow: none !important;
    }
  }
`;
