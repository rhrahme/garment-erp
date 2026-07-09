import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { sarToDhs } from "@/lib/currency/config";
import type { InvoiceDocumentData } from "@/components/invoicing/InvoiceDocument";
import {
  computeInvoiceLineTotals,
  formatInvoiceClientName,
  formatInvoiceClientRef,
} from "@/lib/invoicing/display";
import {
  getInvoiceBankDetails,
  getInvoiceIssuerDetails,
  isDubaiFabricDelivery,
} from "@/lib/invoicing/bank-details";
import { DHS_TOTAL_LABEL } from "@/components/invoicing/InvoiceTotalsFooter";
import {
  formatInvoiceDhsForPdf,
  formatInvoiceSarForPdf,
} from "@/lib/invoicing/format-amount";
import { formatDate } from "@/lib/utils";

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
    margin: { left: margin, right: margin, bottom: 60 },
    head: [["Art.", "Garment", "Composition", "Qty", "Unit price", "Amount"]],
    body: invoice.lines.map((line) => [
      line.article_label,
      line.description,
      line.composition_label,
      String(line.quantity),
      formatInvoiceSarForPdf(line.unit_price),
      formatInvoiceSarForPdf(line.line_total),
    ]),
    styles: { fontSize: 8, cellPadding: 4, valign: "top", overflow: "linebreak" },
    headStyles: { fillColor: [255, 255, 255], textColor: [100, 100, 100], fontStyle: "bold" },
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
    didDrawPage: (data) => {
      y = data.cursor?.y ?? y;
    },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  const lineTotals = computeInvoiceLineTotals(invoice.lines);
  const totalsBody: string[][] = [
    ["Total garment items", String(lineTotals.totalGarmentItems)],
    ["Total quantity", String(lineTotals.totalQuantity)],
    [`Subtotal (${invoice.currency})`, formatInvoiceSarForPdf(invoice.subtotal)],
  ];
  if (showDhsEquivalent) {
    totalsBody.push(["Subtotal (DHS)", formatInvoiceDhsForPdf(sarToDhs(invoice.subtotal))]);
  }
  if (invoice.vat_rate != null && invoice.vat_rate > 0) {
    totalsBody.push([
      `VAT (${Math.round(invoice.vat_rate * 100)}%)`,
      formatInvoiceSarForPdf(invoice.vat_amount),
    ]);
    if (showDhsEquivalent) {
      totalsBody.push(["VAT (DHS)", formatInvoiceDhsForPdf(sarToDhs(invoice.vat_amount))]);
    }
  }
  totalsBody.push([`Total (${invoice.currency})`, formatInvoiceSarForPdf(invoice.total)]);
  const dhsTotalRowIndex = showDhsEquivalent ? totalsBody.length : -1;
  if (showDhsEquivalent) {
    totalsBody.push([DHS_TOTAL_LABEL, formatInvoiceDhsForPdf(sarToDhs(invoice.total))]);
  }

  /** Tailwind slate-200 — highlight payable DHS total in generated PDFs. */
  const dhsTotalRowFill: [number, number, number] = [226, 232, 240];

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
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === dhsTotalRowIndex) {
        data.cell.styles.fillColor = dhsTotalRowFill;
      }
    },
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
