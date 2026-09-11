import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  costHintConstantColumns,
  costHintPrimaryFabricNumber,
  formatCostHintArticleSummary,
  formatCostHintComposition,
  formatCostHintWeight,
  summarizeCostHintArticles,
  uniqueCostHintSoNumbers,
  type CostHintWorksheet,
  type CostHintWorksheetRow,
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
      .map((row) => ({
        supplier_id: row.supplier_id,
        fabric_number: costHintPrimaryFabricNumber(row.fabric_number),
      }))
      .filter(
        (row): row is { supplier_id: string; fabric_number: string } =>
          Boolean(row.supplier_id && row.fabric_number)
      )
  );

  const heading = worksheet.title?.trim() || "Cost hint worksheet";
  const title = heading.toUpperCase().startsWith("INTERNAL") ? heading : `INTERNAL - ${heading}`;
  const soCount = uniqueCostHintSoNumbers(worksheet.rows).length;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const titleLines = doc.splitTextToSize(title, pageW - margin * 2);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  const subtitle = doc.splitTextToSize(worksheet.subtitle, pageW - margin * 2);
  doc.text(subtitle, margin, y);
  y += subtitle.length * 12 + 4;
  doc.text(
    `Printed ${generatedLabel(worksheet.generated_at)} Riyadh. ${worksheet.rows.length} lines. ${soCount} sales order${soCount === 1 ? "" : "s"}. ${worksheet.missing_price_count} missing fabric price.`,
    margin,
    y
  );
  y += 14;

  const constant = costHintConstantColumns(worksheet.rows);
  const constantParts = [
    constant.client_name ? `Client: ${constant.client_name}` : null,
    constant.invoice_number ? `Invoice: ${constant.invoice_number}` : null,
    constant.so_numbers
      ? `Sales order${constant.so_numbers.length === 1 ? "" : "s"}: ${constant.so_numbers.join(", ")}`
      : null,
  ].filter(Boolean);
  if (constantParts.length > 0) {
    const constantLines = doc.splitTextToSize(constantParts.join("   |   "), pageW - margin * 2);
    doc.text(constantLines, margin, y);
    y += constantLines.length * 12 + 2;
  }
  const articleSummary =
    worksheet.article_summary ||
    formatCostHintArticleSummary(summarizeCostHintArticles(worksheet.rows));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  const summaryLines = doc.splitTextToSize(articleSummary, pageW - margin * 2);
  doc.text(summaryLines, margin, y);
  y += summaryLines.length * 13 + 6;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);

  type WorksheetColumn = {
    header: string;
    hidden?: boolean;
    swatch?: boolean;
    style?: { cellWidth?: number; halign?: "left" | "center" | "right" };
    value: (row: CostHintWorksheetRow) => string;
  };

  // Columns that never change are printed once above the table instead.
  const columns: WorksheetColumn[] = [
    { header: "SO", hidden: constant.so_numbers != null, value: (row) => row.so_number },
    { header: "INV", hidden: constant.invoice_number != null, value: (row) => row.invoice_number ?? "-" },
    { header: "Client", hidden: constant.client_name != null, value: (row) => row.client_name },
    { header: "Art.", style: { cellWidth: 26, halign: "center" }, value: (row) => row.article_label },
    { header: "Garment", value: (row) => row.garment },
    { header: "Swatch", swatch: true, style: { cellWidth: 30, halign: "center" }, value: () => "" },
    { header: "Fabric", value: (row) => row.fabric_number || "-" },
    { header: "Brand", value: (row) => row.fabric_brand || "-" },
    { header: "Comp.", value: (row) => formatCostHintComposition(row.composition) },
    { header: "Weight", style: { cellWidth: 36, halign: "right" }, value: (row) => formatCostHintWeight(row.weight_gsm) },
    { header: "Qty", style: { cellWidth: 24, halign: "right" }, value: (row) => String(row.quantity) },
    {
      header: "Fabric cost",
      style: { cellWidth: 52, halign: "right" },
      value: (row) => (row.missing_price && row.fabric_cost_sar == null ? "-" : money(row.fabric_cost_sar)),
    },
    {
      header: "Cost hint",
      style: { cellWidth: 52, halign: "right" },
      value: (row) => (row.missing_price && row.cost_hint_sar == null ? "-" : money(row.cost_hint_sar)),
    },
    { header: "Unit price", style: { cellWidth: 52, halign: "right" }, value: (row) => money(row.unit_price_sar) },
    { header: "Write price", style: { cellWidth: 46 }, value: () => "" },
  ];
  const visibleColumns = columns.filter((column) => !column.hidden);
  const swatchColumnIndex = visibleColumns.findIndex((column) => column.swatch);
  const columnStyles: Record<number, { cellWidth?: number; halign?: "left" | "center" | "right" }> = {};
  visibleColumns.forEach((column, index) => {
    if (column.style) columnStyles[index] = column.style;
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 36 },
    head: [visibleColumns.map((column) => column.header)],
    body: worksheet.rows.map((row) => visibleColumns.map((column) => column.value(row))),
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 3,
      valign: "middle",
      overflow: "linebreak",
      minCellHeight: 30,
    },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
    tableWidth: pageW - margin * 2,
    columnStyles,
    showHead: "everyPage",
    theme: "grid",
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== swatchColumnIndex) return;
      const row = worksheet.rows[data.row.index];
      const fabricNumber = costHintPrimaryFabricNumber(row?.fabric_number);
      if (!row?.supplier_id || !fabricNumber) return;
      const img = swatchJpegs.get(swatchCacheKey(row.supplier_id, fabricNumber));
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
