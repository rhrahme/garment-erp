/**
 * One-page Riyadh bank details PDF for client payments.
 * Data source: src/lib/invoicing/bank-details.ts (RIYADH_INVOICE_BANK_DETAILS)
 *
 * Usage: node scripts/generate-riyadh-bank-details-pdf.mjs [output.pdf]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { jsPDF } from "jspdf";

/** @see src/lib/invoicing/bank-details.ts */
const COMPANY = {
  name: "Hagan Industries Company",
  legalName: "HAGAN INDUSTRIAL COMPANY Saudi",
  location: "Riyadh, Saudi Arabia",
};

/** @see src/lib/invoicing/bank-details.ts — RIYADH_INVOICE_BANK_DETAILS */
const BANK = {
  accountName: "Hagan Industries Company",
  bank: "Banque Saudi Fransi",
  branch: "Al Ghadir",
  iban: "SA82550000000R0332200106",
  swift: "BSFRSARIXXX",
  currency: "Saudi Riyal (SAR)",
};

const outPath = process.argv[2] ?? "documents-and-data/riyadh-bank-details.pdf";

const doc = new jsPDF({ unit: "pt", format: "a4" });
const margin = 56;
const pageW = doc.internal.pageSize.getWidth();
const pageH = doc.internal.pageSize.getHeight();
const contentW = pageW - margin * 2;

let y = margin + 8;

doc.setFont("helvetica", "bold");
doc.setFontSize(20);
doc.setTextColor(15, 23, 42);
doc.text(COMPANY.name, margin, y);

doc.setFont("helvetica", "normal");
doc.setFontSize(10);
doc.setTextColor(100, 116, 139);
doc.text(COMPANY.legalName, margin, y + 18);
doc.text(COMPANY.location, margin, y + 32);

y += 58;
doc.setDrawColor(226, 232, 240);
doc.setLineWidth(0.75);
doc.line(margin, y, pageW - margin, y);

y += 36;
doc.setFont("helvetica", "bold");
doc.setFontSize(16);
doc.setTextColor(15, 23, 42);
doc.text("Bank Details", margin, y);

y += 10;
doc.setFont("helvetica", "normal");
doc.setFontSize(9);
doc.setTextColor(100, 116, 139);
doc.text("Wire transfer instructions for payments to our Riyadh account.", margin, y);

const boxY = y + 22;
const boxPad = 22;
const rows = [
  ["Account Name", BANK.accountName],
  ["Bank", BANK.bank],
  ["Branch", BANK.branch],
  ["IBAN", BANK.iban],
  ["SWIFT / BIC", BANK.swift],
  ["Currency", BANK.currency],
];

const rowH = 28;
const boxH = boxPad * 2 + rows.length * rowH - 6;
doc.setFillColor(248, 250, 252);
doc.setDrawColor(226, 232, 240);
doc.roundedRect(margin, boxY, contentW, boxH, 6, 6, "FD");

const labelX = margin + boxPad;
const valueX = margin + 148;
const valueW = contentW - boxPad * 2 - (valueX - margin);

let rowY = boxY + boxPad + 12;
for (const [label, value] of rows) {
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(label.toUpperCase(), labelX, rowY);

  doc.setFontSize(10);
  const isMono = label === "IBAN" || label === "SWIFT / BIC";
  doc.setFont("helvetica", label === "Account Name" || label === "IBAN" ? "bold" : "normal");
  doc.setTextColor(15, 23, 42);

  if (isMono) {
    doc.setFont("courier", label === "IBAN" ? "bold" : "normal");
  }

  const lines = doc.splitTextToSize(value, valueW);
  doc.text(lines, valueX, rowY);
  rowY += rowH;
}

const footerY = pageH - margin;
doc.setDrawColor(226, 232, 240);
doc.line(margin, footerY - 18, pageW - margin, footerY - 18);
doc.setFont("helvetica", "normal");
doc.setFontSize(8);
doc.setTextColor(148, 163, 184);
doc.text(
  "Please include your invoice or sales order reference with your payment.",
  margin,
  footerY
);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, Buffer.from(doc.output("arraybuffer")));
console.log("Written:", outPath);
