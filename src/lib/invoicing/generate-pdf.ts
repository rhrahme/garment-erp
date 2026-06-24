import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { sarToDhs } from "@/lib/currency/config";
import type { InvoiceDocumentData } from "@/components/invoicing/InvoiceDocument";
import {
  formatInvoiceClientName,
  formatInvoiceClientRef,
} from "@/lib/invoicing/display";
import {
  getInvoiceBankDetails,
  getInvoiceIssuerDetails,
  isDubaiFabricDelivery,
} from "@/lib/invoicing/bank-details";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";

function formatSar(amount: number): string {
  return formatCurrency(amount, "SAR");
}

function formatDhs(amount: number): string {
  return `${formatNumber(amount, 2)} DHS`;
}

export async function generateCustomerInvoicePdf(invoice: InvoiceDocumentData): Promise<Uint8Array> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  let y = margin;

  const clientRef = formatInvoiceClientRef(invoice.client_code, invoice.client_reference);
  const issuer = getInvoiceIssuerDetails(invoice.delivery_destination, invoice.factory_brand_name);
  const showDhsEquivalent = isDubaiFabricDelivery(invoice.delivery_destination);
  const bank = getInvoiceBankDetails(invoice.delivery_destination);

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(invoice.invoice_number, margin, y);
  doc.setFont("helvetica", "normal");

  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(`Date: ${formatDate(invoice.invoice_date)}`, margin, y + 18);
  if (invoice.due_date) {
    doc.text(`Due: ${formatDate(invoice.due_date)}`, margin, y + 30);
  }

  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(issuer.company_name, pageW - margin, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(issuer.location_line, pageW - margin, y + 14, { align: "right" });
  doc.setTextColor(0);

  y += invoice.due_date ? 52 : 40;
  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 20;

  const colW = (pageW - margin * 2) / 2 - 8;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text("BILL TO", margin, y);
  doc.text("REFERENCE", margin + colW + 16, y);
  y += 14;

  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text(formatInvoiceClientName(invoice.client_name), margin, y);
  doc.setFont("helvetica", "normal");
  let refY = y;
  doc.text(`Sales order: ${invoice.so_number}`, margin + colW + 16, refY);
  refY += 14;
  if (clientRef) {
    doc.text(`Client ref: ${clientRef}`, margin + colW + 16, refY);
    refY += 14;
  }
  if (invoice.payment_terms) {
    doc.text(`Terms: ${invoice.payment_terms}`, margin + colW + 16, refY);
  }

  let billY = y + 14;
  if (invoice.client_email) {
    doc.setTextColor(80);
    doc.text(invoice.client_email, margin, billY);
    billY += 14;
  }
  if (invoice.client_address) {
    const addressLines = doc.splitTextToSize(invoice.client_address, colW);
    doc.text(addressLines, margin, billY);
    billY += addressLines.length * 12;
  }

  y = Math.max(billY, refY + 14) + 12;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Art.", "Garment", "Composition", "Qty", "Unit price", "Amount"]],
    body: invoice.lines.map((line) => [
      line.article_label,
      line.description,
      line.composition_label,
      String(line.quantity),
      formatSar(line.unit_price),
      formatSar(line.line_total),
    ]),
    styles: { fontSize: 8, cellPadding: 4, valign: "top" },
    headStyles: { fillColor: [255, 255, 255], textColor: [100, 100, 100], fontStyle: "bold" },
    columnStyles: {
      0: { halign: "center", cellWidth: 28 },
      3: { halign: "left", cellWidth: 28 },
      4: { halign: "left", cellWidth: 58 },
      5: { halign: "right", cellWidth: 58 },
    },
    theme: "plain",
    didDrawPage: (data) => {
      y = data.cursor?.y ?? y;
    },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  const totalsBody: string[][] = [
    [`Subtotal (${invoice.currency})`, formatSar(invoice.subtotal)],
  ];
  if (showDhsEquivalent) {
    totalsBody.push(["Subtotal (DHS)", formatDhs(sarToDhs(invoice.subtotal))]);
  }
  if (invoice.vat_rate != null && invoice.vat_rate > 0) {
    totalsBody.push([`VAT (${Math.round(invoice.vat_rate * 100)}%)`, formatSar(invoice.vat_amount)]);
    if (showDhsEquivalent) {
      totalsBody.push(["VAT (DHS)", formatDhs(sarToDhs(invoice.vat_amount))]);
    }
  }
  totalsBody.push([`Total (${invoice.currency})`, formatSar(invoice.total)]);
  if (showDhsEquivalent) {
    totalsBody.push(["Equivalent in UAE Dirhams (DHS)", formatDhs(sarToDhs(invoice.total))]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: totalsBody,
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { halign: "right" },
      1: { halign: "right", fontStyle: "bold" },
    },
    theme: "plain",
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;

  if (bank) {
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = margin;
    }

    doc.setDrawColor(200);
    doc.line(margin, y, pageW - margin, y);
    y += 16;

    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("PAYMENT DETAILS", margin, y);
    y += 14;

    doc.setFontSize(9);
    doc.setTextColor(0);
    const bankRows: [string, string][] = [
      ["Beneficiary", bank.beneficiary],
      ["IBAN", bank.iban],
      ["Bank name", bank.bank_name],
      ["Branch", bank.branch_name],
      ["Swift code", bank.swift_code],
    ];
    if (bank.currency) bankRows.push(["Currency", bank.currency]);

    for (const [label, value] of bankRows) {
      doc.setTextColor(100);
      doc.text(label, margin, y);
      doc.setTextColor(0);
      doc.setFont("helvetica", label === "Beneficiary" || label === "IBAN" ? "bold" : "normal");
      doc.text(value, margin + 90, y);
      doc.setFont("helvetica", "normal");
      y += 14;
    }
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
