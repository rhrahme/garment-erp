import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatMeasurementAscii, unitLabel } from "@/lib/pattern-library/measurements";
import { basePatternLabelCode, basePatternQrUrl } from "@/lib/pattern-library/pattern-qr";
import { buildBaseSizeSheetRows } from "@/lib/pattern-library/size-sheet";
import { renderQrPngBuffer } from "@/lib/production/qr-render";
import type { BasePattern } from "@/lib/types/pattern-library";

const MARGIN = 12;
const PAGE_W = 210;
const NAVY: [number, number, number] = [11, 44, 90];
const SLATE: [number, number, number] = [100, 116, 139];
const INK: [number, number, number] = [15, 23, 42];

/** A4 portrait per-size working sheet — mirrors BaseSizeSheetPrintView. */
export async function generateBaseSizeSheetPdf(
  base: BasePattern,
  size: string
): Promise<ArrayBuffer> {
  const rows = buildBaseSizeSheetRows(base, size);
  const labelCode = basePatternLabelCode(base);
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // Title + brand block
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("PATTERN WORKING SHEET", MARGIN, MARGIN + 5);
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.text(labelCode, MARGIN, MARGIN + 12);

  const brandW = 34;
  const brandX = PAGE_W - MARGIN - brandW;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.6);
  doc.rect(brandX, MARGIN, brandW, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(base.house_brand_code, brandX + brandW / 2, MARGIN + 7.5, { align: "center" });
  doc.setFontSize(6);
  doc.setTextColor(...SLATE);
  doc.text("HOUSE BRAND", brandX + brandW / 2, MARGIN + 12, { align: "center" });

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.7);
  doc.line(MARGIN, MARGIN + 16, PAGE_W - MARGIN, MARGIN + 16);

  // Header block (left) + fixed pattern QR (right)
  const headerRows: [string, string][] = [
    ["Cut family", base.cut_family],
    ["Garment", base.garment_type],
    ["Variant", base.cut_variant ?? "-"],
    ["Size", size],
    ["Pattern ref", labelCode],
    ["Date", new Date().toLocaleDateString("en-GB")],
  ];

  const qrSize = 30;
  let headerY = MARGIN + 21;
  const headerRight = PAGE_W - MARGIN - qrSize - 6;
  doc.setFontSize(8.5);
  for (const [label, value] of headerRows) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SLATE);
    doc.text(label.toUpperCase(), MARGIN, headerY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    const wrapped = doc.splitTextToSize(value, headerRight - MARGIN - 30);
    doc.text(wrapped, MARGIN + 30, headerY);
    headerY += 5 * Math.max(1, wrapped.length);
  }

  const { png } = await renderQrPngBuffer(basePatternQrUrl(base.id), 300);
  const qrX = PAGE_W - MARGIN - qrSize;
  doc.addImage(
    `data:image/png;base64,${png.toString("base64")}`,
    "PNG",
    qrX,
    MARGIN + 19,
    qrSize,
    qrSize
  );
  doc.setFont("courier", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(...INK);
  const codeLines = doc.splitTextToSize(labelCode, qrSize + 4);
  doc.text(codeLines, qrX + qrSize / 2, MARGIN + 19 + qrSize + 2.5, { align: "center" });

  // Working grid: base values pre-filled, trial columns empty for handwriting
  const y = Math.max(headerY + 2, MARGIN + 19 + qrSize + 8);
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [
      [
        `Point (${unitLabel(base.unit)})`,
        `Size ${size}`,
        "Sewing",
        "Adjust",
        "Trial 1",
        "Sewing",
        "Trial 2",
        "Sewing",
        "Final",
        "Remarks",
      ],
    ],
    body: rows.map((row) => [
      row.is_graded ? row.name : `${row.name} (trim)`,
      formatMeasurementAscii(row.base_value, base.unit),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      row.remark ?? "",
    ]),
    styles: { fontSize: 7.5, cellPadding: 1.8, textColor: INK, minCellHeight: 7 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { halign: "center", cellWidth: 14, fontStyle: "bold" },
      2: { cellWidth: 14 },
      3: { cellWidth: 14 },
      4: { cellWidth: 14 },
      5: { cellWidth: 14 },
      6: { cellWidth: 14 },
      7: { cellWidth: 14 },
      8: { cellWidth: 14 },
    },
    theme: "grid",
  });

  // Footer
  let footerY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...SLATE);
  doc.text("SPECIAL INSTRUCTIONS:", MARGIN, footerY);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...INK);
  const instructions = base.special_instructions || "-";
  const instructionLines = doc.splitTextToSize(instructions, PAGE_W - MARGIN * 2 - 42);
  doc.text(instructionLines, MARGIN + 42, footerY);
  footerY += 5 * Math.max(1, instructionLines.length);

  if (base.physical_pattern_kept) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SLATE);
    doc.text("PHYSICAL PATTERN:", MARGIN, footerY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text(
      `kept${base.physical_pattern_location ? ` — ${base.physical_pattern_location}` : ""}`,
      MARGIN + 42,
      footerY
    );
    footerY += 5;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...SLATE);
  doc.text(
    `Printed ${new Date().toLocaleDateString("en-GB")} · ${base.name} · size ${size} · ${base.id}`,
    MARGIN,
    footerY + 2
  );

  return doc.output("arraybuffer");
}
