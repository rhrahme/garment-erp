import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { jsPDF } from "jspdf";

register("./scripts/tsconfig-paths-loader.mjs", pathToFileURL("./"));

const { formatInvoiceSarForPdf, formatInvoiceDhsForPdf } = await import(
  "../src/lib/invoicing/format-amount.ts"
);
const { sarToDhs } = await import("../src/lib/currency/config.ts");

// Match generate-pdf.ts: 23 lines -> "dense" density.
const lineFontSize = 7.5;
const lineCellPadding = 2.5;
const amountCellWidth = 78;
const contentWidth = amountCellWidth - lineCellPadding * 2;

const doc = new jsPDF({ unit: "pt", format: "a4" });
doc.setFont("helvetica", "normal");
doc.setFontSize(lineFontSize);

// Every amount that lands in the narrow line-item columns, plus safety-margin extremes.
const amounts = [2100, 4200, 5800, 10000, 12000, 4500.01, 136100.01, 1234567.89];
const strings = [];
for (const a of amounts) {
  strings.push(formatInvoiceSarForPdf(a));
  strings.push(formatInvoiceSarForPdf(sarToDhs(a)));
  strings.push(formatInvoiceDhsForPdf(sarToDhs(a)));
}

let worst = { s: "", w: 0 };
for (const s of strings) {
  const w = doc.getTextWidth(s);
  if (w > worst.w) worst = { s, w };
}

console.log(`Line column content width budget: ${contentWidth}pt (cellWidth ${amountCellWidth} - padding)`);
console.log(`Widest line amount string: "${worst.s}" = ${worst.w.toFixed(1)}pt`);
console.log(`Fits without clipping: ${worst.w <= contentWidth ? "YES" : "NO — CLIPS"}`);

// Sample formatted outputs used on the invoice.
console.log("---");
console.log("Total (SAR):", formatInvoiceSarForPdf(136100.01));
console.log("Total (DHS):", formatInvoiceDhsForPdf(sarToDhs(136100.01)));
console.log("Extreme (SAR):", formatInvoiceSarForPdf(1234567.89));
