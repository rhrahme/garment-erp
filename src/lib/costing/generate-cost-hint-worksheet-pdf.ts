import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatInvoiceSarForPdf } from "@/lib/invoicing/format-amount";
import type { CostHintWorksheet } from "@/lib/costing/cost-hint-worksheet";

function money(amount: number | null): string {
  return amount == null ? "-" : formatInvoiceSarForPdf(amount);
}

function generatedLabel(iso: string): string {
  const stamped = Date.parse(iso);
  if (!Number.isFinite(stamped)) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(stamped));
}

/** Internal landscape worksheet. Never send this PDF to a client. */
export async function generateCostHintWorksheetPdf(worksheet: CostHintWorksheet): Promise<Uint8Array> {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const margin = 28;
  const pageW = doc.internal.pageSize.getWidth();
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("INTERNAL - cost hint worksheet", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  const subtitle = doc.splitTextToSize(worksheet.subtitle, pageW - margin * 2);
  doc.text(subtitle, margin, y);
  y += subtitle.length * 12 + 4;
  doc.text(
    `Printed ${generatedLabel(worksheet.generated_at)} Riyadh. ${worksheet.rows.length} lines. ${worksheet.missing_price_count} missing fabric price.`,
    margin,
    y
  );
  doc.setTextColor(0);
  y += 14;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 36 },
    head: [
      [
        "SO",
        "INV",
        "Client",
        "Art.",
        "Garment",
        "Fabric",
        "Qty",
        "Fabric cost",
        "Cost hint",
        "Unit price",
        "Write price",
      ],
    ],
    body: worksheet.rows.map((row) => [
      row.so_number,
      row.invoice_number ?? "-",
      row.client_name,
      row.article_label,
      row.garment,
      row.fabric_number || "-",
      String(row.quantity),
      row.missing_price && row.fabric_cost_sar == null ? "-" : money(row.fabric_cost_sar),
      row.missing_price && row.cost_hint_sar == null ? "-" : money(row.cost_hint_sar),
      money(row.unit_price_sar),
      "",
    ]),
    styles: { font: "helvetica", fontSize: 7, cellPadding: 2, valign: "middle", overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
    tableWidth: pageW - margin * 2,
    columnStyles: {
      3: { halign: "center" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
      9: { halign: "right" },
    },
    showHead: "everyPage",
    theme: "grid",
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("INTERNAL - not a client invoice", margin, doc.internal.pageSize.getHeight() - 16);
    doc.text(
      `${page} / ${pageCount}`,
      pageW - margin,
      doc.internal.pageSize.getHeight() - 16,
      { align: "right" }
    );
  }

  return doc.output("arraybuffer") as Uint8Array;
}
