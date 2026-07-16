/**
 * Print CSS for receiving A4 sheets (/orders/[id]/print?team=receiving and print-pack).
 *
 * Chrome paginates overflow-x clipped ancestors by tiling content onto extra pages
 * (left half of rows on one sheet, right half on the next). Force landscape + visible
 * overflow + fixed full-width table so multi-page orders break by rows only.
 */
export const RECEIVING_A4_PRINT_CSS = `
  @media print {
    @page {
      size: A4 landscape;
      margin: 8mm;
    }
    html,
    body {
      height: auto !important;
      width: auto !important;
      overflow: visible !important;
      background: white !important;
    }
    /* DashboardShell: h-screen + overflow-hidden / overflow-x-hidden */
    .flex.h-screen,
    .flex.h-screen > div,
    main,
    .sales-order-print,
    .order-print-pack,
    .print-pack-a4 {
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
      overflow-x: visible !important;
      overflow-y: visible !important;
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
    .sales-order-print,
    .order-print-pack {
      padding: 0 !important;
      width: 100% !important;
      max-width: none !important;
    }
    .print-receiving-table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse !important;
      page-break-inside: auto;
      break-inside: auto;
    }
    .print-receiving-table thead {
      display: table-header-group;
    }
    .print-receiving-table tbody {
      display: table-row-group;
    }
    .print-receiving-table tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .print-receiving-table th,
    .print-receiving-table td {
      overflow-wrap: anywhere;
      word-break: break-word;
      vertical-align: top;
    }
    .print-receiving-table img {
      max-width: 11mm !important;
      max-height: 11mm !important;
      width: 11mm !important;
      height: 11mm !important;
    }
  }
`;
