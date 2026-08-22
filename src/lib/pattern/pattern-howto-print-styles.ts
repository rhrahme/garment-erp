/**
 * A4 print CSS for Pattern how-to sheets.
 * Same shrink-to-fit rules as receiving-print-styles.ts.
 */
export const PATTERN_HOWTO_A4_PRINT_CSS = `
@media screen {
  .pattern-howto-print .print-a4-sheet {
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
    font-family: Helvetica, Arial, sans-serif !important;
  }
  .no-print {
    display: none !important;
  }
  .pattern-howto-print,
  .pattern-howto-print .print-a4-sheet {
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
    box-shadow: none !important;
    border: none !important;
  }
  .howto-print-title {
    font-family: Helvetica, Arial, sans-serif !important;
    font-size: 14pt !important;
    line-height: 1.25 !important;
  }
  .howto-print-body {
    font-family: Helvetica, Arial, sans-serif !important;
    font-size: 11pt !important;
    line-height: 1.4 !important;
    white-space: pre-wrap !important;
  }
  .howto-print-kicker {
    font-family: Helvetica, Arial, sans-serif !important;
    font-size: 10pt !important;
  }
}
`;
