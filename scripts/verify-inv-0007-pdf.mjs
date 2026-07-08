import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

register("./scripts/tsconfig-paths-loader.mjs", pathToFileURL("./"));

const { formatInvoiceSarForPdf } = await import("../src/lib/invoicing/format-amount.ts");
const { toInvoiceLineDisplay, sortInvoiceLinesByArticle } = await import("../src/lib/invoicing/display.ts");

const inv = JSON.parse(readFileSync("src/data/customer-invoices.json", "utf8"));
const invoice = inv.invoices.find((i) => i.invoice_number === "INV-2026-0007");
if (!invoice) throw new Error("INV-2026-0007 not found");

const lines = sortInvoiceLinesByArticle(invoice.lines).map(toInvoiceLineDisplay);
const doc = new jsPDF({ unit: "pt", format: "a4" });
const margin = 40;

autoTable(doc, {
  startY: 200,
  margin: { left: margin, right: margin, bottom: 60 },
  head: [["Art.", "Garment", "Composition", "Qty", "Unit price", "Amount"]],
  body: lines.map((line) => [
    line.article_label,
    line.description,
    line.composition_label,
    String(line.quantity),
    formatInvoiceSarForPdf(line.unit_price),
    formatInvoiceSarForPdf(line.line_total),
  ]),
  styles: { fontSize: 8, cellPadding: 4, valign: "top", overflow: "linebreak" },
  columnStyles: {
    0: { halign: "center", cellWidth: 28 },
    2: { cellWidth: "auto" },
    3: { halign: "right", cellWidth: 24 },
    4: { halign: "right", cellWidth: 62 },
    5: { halign: "right", cellWidth: 62 },
  },
  showHead: "everyPage",
  rowPageBreak: "auto",
  theme: "plain",
});

const totalsBody = [
  [`Subtotal (${invoice.currency})`, formatInvoiceSarForPdf(invoice.subtotal)],
  [`Total (${invoice.currency})`, formatInvoiceSarForPdf(invoice.total)],
];
autoTable(doc, {
  startY: doc.lastAutoTable.finalY + 8,
  margin: { left: margin, right: margin },
  body: totalsBody,
  columnStyles: { 0: { halign: "right" }, 1: { halign: "right", fontStyle: "bold" } },
  theme: "plain",
});

writeFileSync("/tmp/inv-0007-fixed.pdf", Buffer.from(doc.output("arraybuffer")));
console.log(`lines: ${lines.length}, subtotal: ${invoice.subtotal}, total: ${invoice.total}`);
console.log("L01 unit:", formatInvoiceSarForPdf(lines[0].unit_price));
console.log("wrote /tmp/inv-0007-fixed.pdf");
