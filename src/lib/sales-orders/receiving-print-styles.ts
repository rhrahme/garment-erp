/**
 * Print CSS for A4 sheets:
 * - /orders/[id]/print?team=receiving|production|full
 * - /orders/[id]/print-pack
 *
 * CLASSIC REGRESSION (IMG_9922 / SO-2026-0129): "tiny table in the middle of A4"
 * with huge side margins. Root causes that MUST stay fixed:
 *
 * 1) Centered max-width wrappers (e.g. max-w-4xl + mx-auto) on a print canvas that is
 *    wider than the paper → browser shrink-to-fit scales the whole page, leaving the
 *    constrained column looking microscopic and centered.
 * 2) DashboardShell overflow-x-hidden → Chrome tiles wide tables horizontally
 *    (left columns on page 1, right columns on page 2).
 * 3) transform:scale / zoom on print ancestors (never allow).
 * 4) Sub-10pt Tailwind print text utilities without CSS overrides.
 *
 * Invariants enforced here (and covered by receiving-print-styles.test.ts):
 * - No transform:scale / zoom shrink
 * - Sheet wrappers width 100% / max-width none
 * - Body table text >= 10pt
 * - Tables table-layout:fixed; width 100%
 * - Overflow visible on shell ancestors
 */
export const RECEIVING_A4_PRINT_CSS = `
  @media print {
    @page {
      size: A4 landscape;
      margin: 6mm;
    }
    html,
    body {
      width: 100% !important;
      max-width: none !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
      background: white !important;
      zoom: 1 !important;
      transform: none !important;
    }
    /* DashboardShell: h-screen + overflow-hidden / overflow-x-hidden / min-w-0 */
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
      zoom: 1 !important;
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
      max-width: none !important;
      table-layout: fixed !important;
      border-collapse: collapse !important;
      page-break-inside: auto;
      break-inside: auto;
      font-size: 11pt !important;
      line-height: 1.35 !important;
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
    .print-receiving-table th {
      font-size: 9pt !important;
      font-weight: 700 !important;
      line-height: 1.3 !important;
      overflow-wrap: anywhere;
      word-break: break-word;
      vertical-align: bottom;
      padding: 2mm 1.5mm !important;
    }
    .print-receiving-table td {
      font-size: 11pt !important;
      line-height: 1.35 !important;
      overflow-wrap: anywhere;
      word-break: break-word;
      vertical-align: top;
      padding: 2mm 1.5mm !important;
    }
    .print-receiving-table .print-composition,
    .print-receiving-table .print-garment {
      font-size: 11pt !important;
      line-height: 1.4 !important;
    }
    .print-receiving-table img {
      max-width: 16mm !important;
      max-height: 16mm !important;
      width: 16mm !important;
      height: 16mm !important;
    }
    .print-prod-section {
      break-inside: avoid-page;
    }
    .print-prod-fabric-section {
      break-before: page;
      page-break-before: always;
    }
  }
`;
