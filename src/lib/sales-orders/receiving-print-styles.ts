/**
 * Print CSS for A4 sheets (Chrome + Safari):
 * - /orders/[id]/print?team=receiving|production|full  (served from (print) layout)
 * - /orders/[id]/print-pack                            (still under dashboard; shell kills retained)
 *
 * CLASSIC REGRESSION (IMG_9922 / SO-2026-0129): "tiny table in the middle of A4"
 * with huge side margins. Root causes that MUST stay fixed:
 *
 * 1) Centered max-width wrappers (e.g. max-w-4xl + mx-auto) wider than the paper
 *    content box -> browser shrink-to-fit scales the whole page microscopic.
 * 2) DashboardShell overflow-x-hidden / h-screen -> horizontal tile or shrink.
 *    Production A4 now lives under (print) layout (no shell). Shell kills remain
 *    for print-pack only.
 * 3) transform:scale / zoom on print ancestors (never allow).
 * 4) Sub-10pt Tailwind print text utilities without CSS overrides.
 * 5) Landscape @page while the printer dialog defaults to Portrait -> browsers
 *    embed the landscape page into a portrait sheet and shrink (thin strip).
 * 6) break-inside:avoid-page on tall production sections -> engines shrink the
 *    block to one page. Allow row pagination instead.
 * 7) html/body width:auto at print time -> Chromium can lay out to the screen
 *    viewport then shrink-to-fit A4. Lock width to the page content box.
 *
 * Invariants (receiving-print-styles.test.ts):
 * - A4 portrait, margins 12mm
 * - html/body width 100% of page (not auto), no zoom/scale
 * - Sheet wrappers width 100% / max-width none in print
 * - Body table text 10-12pt
 * - Tables table-layout:fixed; width 100%
 * - No avoid-page on .print-prod-section
 * - Print page lives under app/(print)/...
 */
export const RECEIVING_A4_PRINT_CSS = `
  /* Screen preview: content-box width (A4 minus 12mm margins), not full 210mm paper. */
  @media screen {
    .sales-order-print .print-a4-sheet,
    .order-print-pack .print-a4-sheet {
      width: 186mm;
      max-width: 100%;
      margin-left: auto;
      margin-right: auto;
      box-sizing: border-box;
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
      color-adjust: exact;
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
      color-adjust: exact;
    }
    /* Belt-and-suspenders for print-pack still inside DashboardShell */
    .flex.h-screen,
    .flex.h-screen > div,
    .min-w-0,
    main,
    .sales-order-print,
    .order-print-pack,
    .print-pack-a4,
    .print-a4-sheet {
      height: auto !important;
      max-height: none !important;
      min-width: 0 !important;
      width: 100% !important;
      max-width: none !important;
      overflow: visible !important;
      overflow-x: visible !important;
      overflow-y: visible !important;
      transform: none !important;
      float: none !important;
      position: static !important;
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
    .order-print-pack,
    .print-a4-sheet {
      padding: 0 !important;
      margin: 0 !important;
      width: 100% !important;
      max-width: none !important;
      box-sizing: border-box !important;
    }
    /* Kill the historical shrink trap even if a max-w-* utility sneaks back in */
    .sales-order-print .max-w-4xl,
    .sales-order-print .max-w-5xl,
    .sales-order-print .max-w-6xl,
    .sales-order-print .max-w-7xl,
    .order-print-pack .max-w-4xl,
    .order-print-pack .max-w-5xl,
    .print-a4-sheet.max-w-4xl,
    .mx-auto.max-w-4xl {
      width: 100% !important;
      max-width: none !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }
    .print-receiving-table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse !important;
      page-break-inside: auto;
      break-inside: auto;
      font-size: 11pt !important;
      line-height: 1.35 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-receiving-table thead {
      display: table-header-group;
    }
    .print-receiving-table tbody {
      display: table-row-group;
    }
    .print-receiving-table tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .print-receiving-table th {
      font-size: 9pt !important;
      font-weight: 700 !important;
      line-height: 1.3 !important;
      overflow-wrap: anywhere;
      word-break: break-word;
      vertical-align: bottom;
      padding: 1.5mm 1mm !important;
    }
    .print-receiving-table td {
      font-size: 11pt !important;
      line-height: 1.35 !important;
      overflow-wrap: anywhere;
      word-break: break-word;
      vertical-align: top;
      padding: 1.5mm 1mm !important;
    }
    .print-receiving-table .print-composition,
    .print-receiving-table .print-garment {
      font-size: 11pt !important;
      line-height: 1.4 !important;
    }
    .print-receiving-table img {
      max-width: 14mm !important;
      max-height: 14mm !important;
      width: 14mm !important;
      height: 14mm !important;
      opacity: 1 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* Tall piece lists must paginate by row - never shrink a whole section to one page. */
    .print-prod-section {
      page-break-inside: auto;
      break-inside: auto;
    }
    .print-prod-fabric-section {
      page-break-before: always;
      break-before: page;
    }
  }
`;
