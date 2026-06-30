import { jsPDF } from "jspdf";
import { RIYADH_INVOICE_BANK_DETAILS } from "@/lib/invoicing/bank-details";

const COMPANY = {
  name: "Hagan Industries Company",
  legalName: "HAGAN INDUSTRIAL COMPANY Saudi",
  location: "Riyadh, Saudi Arabia",
};

/** One-page Riyadh wire transfer instructions PDF — data from bank-details.ts */
export function generateRiyadhBankDetailsPdf(): Uint8Array {
  const bank = RIYADH_INVOICE_BANK_DETAILS;
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
  const rows: [string, string][] = [
    ["Account Name", bank.beneficiary],
    ["Bank", bank.bank_name],
    ["Branch", bank.branch_name],
    ["IBAN", bank.iban],
    ["SWIFT / BIC", bank.swift_code],
    ["Currency", "Saudi Riyal (SAR)"],
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

  return new Uint8Array(doc.output("arraybuffer"));
}
