import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatMeasurementAscii, unitLabel } from "@/lib/pattern-library/measurements";
import { renderQrPngBuffer } from "@/lib/production/qr-render";
import type { PatternSheetData } from "@/lib/pattern-library/sheet-data";

const MARGIN = 12;
const PAGE_W = 210;
const NAVY: [number, number, number] = [11, 44, 90];
const SLATE: [number, number, number] = [100, 116, 139];
const INK: [number, number, number] = [15, 23, 42];

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-GB");
}

/** A4 portrait client-pattern measurement sheet — mirrors the print view. */
export async function generatePatternSheetPdf(data: PatternSheetData): Promise<ArrayBuffer> {
  const {
    pattern,
    version,
    fabric,
    order,
    stickers,
    derived_from,
    house_brand,
    base_fill_warning,
    resolved_base_size,
  } = data;
  const unit = pattern.unit;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // Title + brand letterhead
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("PATTERN MEASUREMENT SHEET", MARGIN, MARGIN + 5);
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.text(pattern.pattern_ref, MARGIN, MARGIN + 12);

  const brandCode = house_brand.code ?? "-";
  const brandName = house_brand.name ?? "House brand";
  const brandW = 38;
  const brandH = house_brand.name ? 16 : 14;
  const brandX = PAGE_W - MARGIN - brandW;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.6);
  doc.rect(brandX, MARGIN, brandW, brandH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(brandCode, brandX + brandW / 2, MARGIN + 7.5, { align: "center" });
  doc.setFontSize(6.5);
  doc.setTextColor(...INK);
  doc.text(brandName.toUpperCase(), brandX + brandW / 2, MARGIN + 13, { align: "center" });

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.7);
  const ruleY = MARGIN + Math.max(16, brandH + 2);
  doc.line(MARGIN, ruleY, PAGE_W - MARGIN, ruleY);

  // Header block (left) + QR (right)
  const headerRows: [string, string][] = [
    ["Client", `${pattern.client_name} (${pattern.client_code})`],
    ["Garment", pattern.garment_type],
    ["Description", pattern.description ?? "-"],
    ["Derived from", derived_from ?? "-"],
    [
      "Order",
      order
        ? `${order.so_number} · ordered ${formatDate(order.order_date)}${order.delivery_date ? ` · delivery ${formatDate(order.delivery_date)}` : ""}`
        : "-",
    ],
    [
      "Trial",
      `Trial ${version.version}${version.is_final ? " — FINAL" : ""} · ${formatDate(version.trial_date)}`,
    ],
  ];

  const qrSize = 30;
  const hasQr = stickers.length > 0;
  const headerStartY = ruleY + 5;
  let headerY = headerStartY;
  const headerRight = hasQr ? PAGE_W - MARGIN - qrSize - 6 : PAGE_W - MARGIN;
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

  let qrBottom = headerStartY;
  if (hasQr) {
    const sticker = stickers[0]!;
    const { png } = await renderQrPngBuffer(sticker.qr_payload, 300);
    const qrX = PAGE_W - MARGIN - qrSize;
    doc.addImage(
      `data:image/png;base64,${png.toString("base64")}`,
      "PNG",
      qrX,
      headerStartY - 2,
      qrSize,
      qrSize
    );
    doc.setFont("courier", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...INK);
    const codeLines = doc.splitTextToSize(sticker.code, qrSize + 4);
    doc.text(codeLines, qrX + qrSize / 2, headerStartY - 2 + qrSize + 2.5, { align: "center" });
    qrBottom = headerStartY - 2 + qrSize + 2.5 + codeLines.length * 2.5;
  }

  let y = Math.max(headerY + 2, qrBottom + 3);
  if (base_fill_warning) {
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(251, 191, 36);
    doc.setLineWidth(0.3);
    const warnLines = doc.splitTextToSize(base_fill_warning, PAGE_W - MARGIN * 2 - 4);
    const warnH = 4 + warnLines.length * 4;
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, warnH, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(120, 53, 15);
    doc.text(warnLines, MARGIN + 2, y + 3.5);
    y += warnH + 3;
  }

  // Fabric specification block
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  const fabricRows = fabric
    ? [
        [`Fabric: ${fabric.fabric_number}`, `Supplier: ${fabric.supplier_name}`, `Color: ${fabric.color ?? "-"}`],
        [
          `Composition: ${fabric.composition ?? "-"}`,
          `Weight: ${fabric.gsm ? `${fabric.gsm} gsm` : "-"}`,
          `Width: ${fabric.width_cm ? `${fabric.width_cm} cm` : fabric.width_inches ? `${fabric.width_inches}"` : "-"}`,
        ],
      ]
    : [[pattern.fabric ? `Fabric: ${pattern.fabric}` : "No linked order fabric line.", "", ""]];
  const fabricBoxH = 6 + fabricRows.length * 5;
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, fabricBoxH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...SLATE);
  doc.text("FABRIC SPECIFICATION", MARGIN + 3, y + 4.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  fabricRows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell) doc.text(cell, MARGIN + 3 + colIndex * 62, y + 9.5 + rowIndex * 5);
    });
  });
  y += fabricBoxH + 5;

  // Measurement grid
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [[
      `Measurement point (${unitLabel(unit)})`,
      resolved_base_size
        ? `Base (${resolved_base_size})`
        : pattern.base_size
          ? `Base (${pattern.base_size})`
          : "Base",
      "Target",
      "Sewn",
      "Adjust +/-",
      "Remarks",
    ]],
    body: version.measurements.map((row) => [
      row.remark ? `${row.name} — ${row.remark}` : row.name,
      formatMeasurementAscii(row.base_value, unit),
      formatMeasurementAscii(row.target_value, unit),
      formatMeasurementAscii(row.sewn_value, unit),
      row.adjustment !== null
        ? `${row.adjustment > 0 ? "+" : row.adjustment < 0 ? "-" : ""}${formatMeasurementAscii(Math.abs(row.adjustment), unit)}`
        : "-",
      row.remarks ?? "",
    ]),
    styles: { fontSize: 8, cellPadding: 1.6, textColor: INK },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { halign: "center", cellWidth: 18 },
      2: { halign: "center", cellWidth: 18, fontStyle: "bold" },
      3: { halign: "center", cellWidth: 18 },
      4: { halign: "center", cellWidth: 18 },
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
  const instructions = version.special_instructions || pattern.special_instructions || "-";
  const instructionLines = doc.splitTextToSize(instructions, PAGE_W - MARGIN * 2 - 42);
  doc.text(instructionLines, MARGIN + 42, footerY);
  footerY += 5 * Math.max(1, instructionLines.length);

  if (pattern.physical_pattern_kept) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SLATE);
    doc.text("PHYSICAL PATTERN:", MARGIN, footerY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text(
      `kept${pattern.physical_pattern_location ? ` — ${pattern.physical_pattern_location}` : ""}`,
      MARGIN + 42,
      footerY
    );
    footerY += 5;
  }

  if (stickers.length > 1) {
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.text(`Pieces: ${stickers.map((sticker) => sticker.code).join("   ")}`, MARGIN, footerY);
    footerY += 5;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...SLATE);
  doc.text(
    `Printed ${new Date().toLocaleDateString("en-GB")} · ${pattern.pattern_ref} · Trial ${version.version}${version.is_final ? " (Final)" : ""}`,
    MARGIN,
    footerY + 2
  );

  return doc.output("arraybuffer");
}
