import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatCostHintArticleSummary,
  formatCostHintComposition,
  formatCostHintWeight,
  summarizeCostHintArticles,
  type CostHintWorksheet,
} from "@/lib/costing/cost-hint-worksheet";
import {
  loadFabricSwatchJpegsForPdf,
  swatchCacheKey,
} from "@/lib/fabric-sourcing/resolve-fabric-swatch-for-pdf";
import { formatInvoiceSarForPdf } from "@/lib/invoicing/format-amount";

const SWATCH_DRAW_PT = 22;

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
  const margin = 22;
  const pageW = doc.internal.pageSize.getWidth();
  let y = margin;

  const swatchJpegs = await loadFabricSwatchJpegsForPdf(
    worksheet.rows
      .filter((row) => row.supplier_id && row.fabric_number)
      .map((row) => ({ supplier_id: row.supplier_id as string, fabric_number: row.fabric_number }))
  );

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
  y += 14;
  const articleSummary = formatCostHintArticleSummary(summarizeCostHintArticles(worksheet.rows));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  const summaryLines = doc.splitTextToSize(articleSummary, pageW - margin * 2);
  doc.text(summaryLines, margin, y);
  y += summaryLines.length * 13 + 6;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);

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
        "Swatch",
        "Fabric",
        "Brand",
        "Comp.",
        "Weight",
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
      "",
      row.fabric_number || "-",
      row.fabric_brand || "-",
      formatCostHintComposition(row.composition),
      formatCostHintWeight(row.weight_gsm),
      String(row.quantity),
      row.missing_price && row.fabric_cost_sar == null ? "-" : money(row.fabric_cost_sar),
      row.missing_price && row.cost_hint_sar == null ? "-" : money(row.cost_hint_sar),
      money(row.unit_price_sar),
      "",
    ]),
    styles: {
      font: "helvetica",
      fontSize: 6.5,
      cellPadding: 2,
      valign: "middle",
      overflow: "linebreak",
      minCellHeight: 30,
    },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
    tableWidth: pageW - margin * 2,
    columnStyles: {
      3: { cellWidth: 22, halign: "center" },
      5: { cellWidth: 30, halign: "center" },
      9: { cellWidth: 32, halign: "right" },
      10: { cellWidth: 20, halign: "right" },
      11: { cellWidth: 48, halign: "right" },
      12: { cellWidth: 48, halign: "right" },
      13: { cellWidth: 48, halign: "right" },
      14: { cellWidth: 42 },
    },
    showHead: "everyPage",
    theme: "grid",
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 5) return;
      const row = worksheet.rows[data.row.index];
      if (!row?.supplier_id || !row.fabric_number) return;
      const img = swatchJpegs.get(swatchCacheKey(row.supplier_id, row.fabric_number));
      if (!img) return;
      doc.addImage(
        img,
        "JPEG",
        data.cell.x + (data.cell.width - SWATCH_DRAW_PT) / 2,
        data.cell.y + (data.cell.height - SWATCH_DRAW_PT) / 2,
        SWATCH_DRAW_PT,
        SWATCH_DRAW_PT
      );
    },
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
