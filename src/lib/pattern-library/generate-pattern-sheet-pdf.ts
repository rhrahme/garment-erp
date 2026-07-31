import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatMeasurementAscii, unitLabel } from "@/lib/pattern-library/measurements";
import {
  clientPatternLabelCode,
  clientPatternQrUrl,
} from "@/lib/pattern-library/pattern-qr";
import { renderQrPngBuffer } from "@/lib/production/qr-render";
import type { PatternSheetData, PatternSheetSticker } from "@/lib/pattern-library/sheet-data";

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

function stickerScanLabel(sticker: PatternSheetSticker): string {
  return sticker.role === "prep" ? "Fabric cut (prep)" : sticker.piece_name;
}

function piecePageLabel(sticker: PatternSheetSticker): string {
  if (sticker.piece_index != null && sticker.piece_total != null) {
    return `${sticker.piece_name} (${sticker.piece_index}/${sticker.piece_total})`;
  }
  return sticker.piece_name;
}

async function drawPatternSheetPage(
  doc: jsPDF,
  data: PatternSheetData,
  sticker: PatternSheetSticker | null,
  pageIndex: number,
  pageTotal: number,
  patternQrPng: Buffer
): Promise<void> {
  const {
    pattern,
    version,
    fabric,
    order,
    job,
    derived_from,
    house_brand,
    base_fill_warning,
    resolved_base_size,
  } = data;
  const unit = pattern.unit;

  // Title + brand letterhead
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("PATTERN MEASUREMENT SHEET", MARGIN, MARGIN + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...SLATE);
  doc.text(
    "Cutting handoff - fold fabric, place parts, cut, then scan floor QR",
    MARGIN,
    MARGIN + 9.5
  );
  doc.setTextColor(...INK);
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.text(pattern.pattern_ref, MARGIN, MARGIN + 16);
  let titleExtraY = MARGIN + 16;
  if (job?.pattern_code) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    titleExtraY += 5;
    doc.text(`TUD name: ${job.pattern_code}`, MARGIN, titleExtraY);
    doc.setTextColor(...INK);
  }
  if (pageTotal > 1 && sticker) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    titleExtraY += 5;
    doc.text(`Piece ${pageIndex}/${pageTotal}: ${piecePageLabel(sticker)}`, MARGIN, titleExtraY);
  }

  const brandCode = house_brand.code ?? "-";
  const brandName = house_brand.name ?? "House brand";
  const brandW = 38;
  const brandH = house_brand.name ? 16 : 14;
  const patternQrLabel = clientPatternLabelCode(pattern);
  const patternQrSize = 18;
  const brandX = PAGE_W - MARGIN - brandW - patternQrSize - 4;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.6);
  doc.rect(brandX, MARGIN, brandW, brandH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text(brandCode, brandX + brandW / 2, MARGIN + 7.5, { align: "center" });
  doc.setFontSize(6.5);
  doc.text(brandName.toUpperCase(), brandX + brandW / 2, MARGIN + 13, { align: "center" });

  // Pattern library QR (archive deep link) - not the floor scan code
  const patternQrX = PAGE_W - MARGIN - patternQrSize;
  doc.addImage(
    `data:image/png;base64,${patternQrPng.toString("base64")}`,
    "PNG",
    patternQrX,
    MARGIN,
    patternQrSize,
    patternQrSize
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4);
  doc.setTextColor(...SLATE);
  doc.text("PATTERN LIBRARY", patternQrX + patternQrSize / 2, MARGIN + patternQrSize + 2, {
    align: "center",
  });
  doc.setFont("courier", "normal");
  doc.setFontSize(4);
  doc.setTextColor(...INK);
  const patternLabelLines = doc.splitTextToSize(patternQrLabel, patternQrSize + 6);
  doc.text(patternLabelLines, patternQrX + patternQrSize / 2, MARGIN + patternQrSize + 4.5, {
    align: "center",
  });

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.7);
  const ruleY = Math.max(
    titleExtraY + 4,
    MARGIN + Math.max(16, brandH + 2, patternQrSize + 2 + patternLabelLines.length * 2)
  );
  doc.line(MARGIN, ruleY, PAGE_W - MARGIN, ruleY);

  // Header block
  const headerRows: [string, string][] = [
    ["Client", `${pattern.client_name} (${pattern.client_code})`],
    ["Garment", pattern.garment_type],
    ["Description", pattern.description ?? "-"],
    ["Origin", derived_from ?? "Custom"],
    [
      "Order",
      order
        ? `${order.so_number} · ordered ${formatDate(order.order_date)}${order.delivery_date ? ` · delivery ${formatDate(order.delivery_date)}` : ""}`
        : "-",
    ],
    [
      "Trial",
      `Trial ${version.version}${version.is_final ? " - FINAL" : ""} · ${formatDate(version.trial_date)}`,
    ],
  ];

  let headerY = ruleY + 5;
  doc.setFontSize(8.5);
  for (const [label, value] of headerRows) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SLATE);
    doc.text(label.toUpperCase(), MARGIN, headerY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    const wrapped = doc.splitTextToSize(value, PAGE_W - MARGIN * 2 - 30);
    doc.text(wrapped, MARGIN + 30, headerY);
    headerY += 5 * Math.max(1, wrapped.length);
  }

  let y = headerY + 3;
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
  y += fabricBoxH + 4;

  // Cut nest preview for cutter (folded fabric placement)
  y = drawCutNestPreview(doc, data, y);

  // Manufacturing scan QR - this piece only (cutter / floor stages)
  if (sticker) {
    const qrSize = 28;
    const labelH = 10;
    const boxH = 8 + qrSize + labelH;
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.5);
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, boxH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...INK);
    doc.text(
      `CUTTING / FLOOR SCAN QR - ${piecePageLabel(sticker).toUpperCase()}`,
      MARGIN + 3,
      y + 4
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...SLATE);
    doc.text(
      "Handoff to cutting: cutter scans at cut; stitchers scan later (same as stickers)",
      MARGIN + 3,
      y + 7.5
    );

    const { png } = await renderQrPngBuffer(sticker.qr_payload, 300);
    const qrX = (PAGE_W - qrSize) / 2;
    const qrY = y + 9;
    doc.addImage(
      `data:image/png;base64,${png.toString("base64")}`,
      "PNG",
      qrX,
      qrY,
      qrSize,
      qrSize
    );
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...INK);
    doc.text(stickerScanLabel(sticker).toUpperCase(), qrX + qrSize / 2, qrY + qrSize + 3, {
      align: "center",
    });
    doc.setFont("courier", "normal");
    doc.setFontSize(6);
    const codeLines = doc.splitTextToSize(sticker.production_code, 60);
    doc.text(codeLines, qrX + qrSize / 2, qrY + qrSize + 6.5, { align: "center" });
    y += boxH + 4;
  }

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
      row.remark ? `${row.name} - ${row.remark}` : row.name,
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
      `kept${pattern.physical_pattern_location ? ` - ${pattern.physical_pattern_location}` : ""}`,
      MARGIN + 42,
      footerY
    );
    footerY += 5;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...SLATE);
  const footerBits = [
    `Printed ${new Date().toLocaleDateString("en-GB")}`,
    pattern.pattern_ref,
    `Trial ${version.version}${version.is_final ? " (Final)" : ""}`,
  ];
  if (sticker) footerBits.push(sticker.production_code);
  doc.text(footerBits.join(" · "), MARGIN, footerY + 2);
}

/** Draw TUD parts list for the cutter. Returns next Y. */
function drawCutterPartsFromTud(
  doc: jsPDF,
  plan: NonNullable<PatternSheetData["cut_nest"]["cutter_plan"]>,
  startY: number
): number {
  const boxW = PAGE_W - MARGIN * 2;
  const rows = [...plan.shell_pieces, ...plan.other_pieces];
  const rowH = 3.6;
  const headerH = 10;
  const boxH = headerH + 4 + rows.length * rowH + 4;
  let y = startY;

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.3);
  doc.setFillColor(248, 250, 252);
  doc.rect(MARGIN, y, boxW, boxH, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...INK);
  doc.text(
    `PARTS FROM TUD (SIZE ${plan.size}) - ${plan.total_cut_pieces} TO CUT`,
    MARGIN + 3,
    y + 4
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(...SLATE);
  doc.text(plan.instruction, MARGIN + 3, y + 7.5);

  let rowY = y + headerH;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.text("PIECE", MARGIN + 3, rowY);
  doc.text("QTY", MARGIN + 42, rowY);
  doc.text("FABRIC", MARGIN + 52, rowY);
  doc.text("APPROX", MARGIN + 78, rowY);
  doc.text("PLACE", MARGIN + 100, rowY);
  rowY += 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(...INK);
  for (const row of rows) {
    rowY += rowH;
    const label = row.code ? `${row.name} ${row.code}` : row.name;
    doc.text(label.slice(0, 28), MARGIN + 3, rowY);
    doc.text(String(row.cut_quantity), MARGIN + 42, rowY);
    doc.text(row.fabric_label.slice(0, 12), MARGIN + 52, rowY);
    doc.text(
      `${row.approx_width_cm.toFixed(0)}x${row.approx_height_cm.toFixed(0)} cm`,
      MARGIN + 78,
      rowY
    );
    doc.text(row.place_hint.slice(0, 42), MARGIN + 100, rowY);
  }

  doc.setFontSize(5);
  doc.setTextColor(...SLATE);
  doc.text(plan.disclaimer, MARGIN + 3, y + boxH - 1.5);
  return y + boxH + 3;
}

/** Draw approximate folded-fabric nest for the cutter. Returns next Y. */
function drawCutNestPreview(doc: jsPDF, data: PatternSheetData, startY: number): number {
  const preview = data.cut_nest;
  const boxW = PAGE_W - MARGIN * 2;
  let y = startY;

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.35);

  if (!preview.nest) {
    const msg =
      preview.missing_reason ?? "Upload TUD + set fabric width for cut nest preview.";
    const lines = doc.splitTextToSize(msg, boxW - 6);
    const boxH = 8 + lines.length * 3.5;
    doc.setFillColor(248, 250, 252);
    doc.rect(MARGIN, y, boxW, boxH, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...SLATE);
    doc.text("FABRIC CUT LAYOUT (FROM TUD)", MARGIN + 3, y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...INK);
    doc.text(lines, MARGIN + 3, y + 8);
    y = y + boxH + 3;
    if (preview.cutter_plan) {
      y = drawCutterPartsFromTud(doc, preview.cutter_plan, y);
    }
    return y;
  }

  const nest = preview.nest;
  const lengthCm = Math.max(
    (preview.board_length_m ?? nest.packed_length_m) * 100,
    nest.packed_length_m * 100,
    ...nest.placements.map((p) => p.x_cm + p.width_cm),
    1
  );
  const usableW = Math.max(nest.usable_width_cm, 1);
  const mapW = boxW - 6;
  const mapH = Math.min(42, Math.max(22, (mapW * usableW) / lengthCm));
  const headerH = 14;
  const footerH = 8;
  const boxH = headerH + mapH + footerH + 4;

  doc.setFillColor(248, 250, 252);
  doc.rect(MARGIN, y, boxW, boxH, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...INK);
  doc.text("FABRIC CUT LAYOUT (FROM TUD)", MARGIN + 3, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...SLATE);
  const foldLabel = nest.double_fold
    ? preview.fold_assumed
      ? "Double fold assumed (shop default)"
      : "Double fold"
    : "Open width";
  const orderBit =
    preview.ordered_length_m != null
      ? ` · ordered ${preview.ordered_length_m.toFixed(2)} m${
          preview.fits_on_order === true
            ? " (fits)"
            : preview.fits_on_order === false
              ? " (OVER)"
              : ""
        }`
      : "";
  doc.text(
    `${foldLabel} - usable ${nest.usable_width_cm} cm of ${nest.fabric_width_cm} cm · packed ${nest.packed_length_m.toFixed(2)} m · size ${nest.size}${orderBit}${preview.source === "saved" ? " · saved marker" : ""}`,
    MARGIN + 3,
    y + 8
  );
  doc.text(
    "TUD pieces placed on fabric without overlap. Approx rectangles from area - not CAD outlines.",
    MARGIN + 3,
    y + 11.5
  );

  const mapX = MARGIN + 3;
  const mapY = y + headerH;
  doc.setFillColor(203, 213, 225);
  doc.setDrawColor(51, 65, 85);
  doc.rect(mapX, mapY, mapW, mapH, "FD");

  const scaleX = mapW / lengthCm;
  const scaleY = mapH / usableW;
  const fills: Array<[number, number, number]> = [
    [249, 168, 212],
    [153, 246, 228],
    [253, 230, 138],
    [196, 181, 253],
    [253, 164, 175],
    [165, 180, 252],
  ];
  const colorByName = new Map<string, [number, number, number]>();
  let colorIdx = 0;

  for (const p of nest.placements) {
    if (!colorByName.has(p.name)) {
      colorByName.set(p.name, fills[colorIdx % fills.length]!);
      colorIdx += 1;
    }
    const fill = colorByName.get(p.name)!;
    const rx = mapX + p.x_cm * scaleX;
    const ry = mapY + p.y_cm * scaleY;
    const rw = Math.max(p.width_cm * scaleX, 1.2);
    const rh = Math.max(p.height_cm * scaleY, 1.2);
    doc.setFillColor(...fill);
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.2);
    doc.rect(rx, ry, rw, rh, "FD");
    if (rw > 10 && rh > 4) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5);
      doc.setTextColor(...INK);
      doc.text(p.name, rx + rw / 2, ry + rh / 2 + 0.8, { align: "center" });
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(...SLATE);
  doc.text(
    `Packed length ${nest.packed_length_m.toFixed(2)} m · ${nest.placements.length} piece rects · efficiency ~${nest.efficiency_pct.toFixed(0)}%`,
    MARGIN + 3,
    y + headerH + mapH + 4
  );

  y = y + boxH + 3;
  if (preview.cutter_plan) {
    y = drawCutterPartsFromTud(doc, preview.cutter_plan, y);
  }
  return y;
}

/** A4 portrait client-pattern measurement sheet - one page per manufacturing piece. */
export async function generatePatternSheetPdf(data: PatternSheetData): Promise<ArrayBuffer> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pages: Array<PatternSheetSticker | null> =
    data.stickers.length > 0 ? data.stickers : [null];

  const { png: patternQrPng } = await renderQrPngBuffer(clientPatternQrUrl(data.pattern.id), 300);

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) doc.addPage();
    await drawPatternSheetPage(doc, data, pages[i]!, i + 1, pages.length, patternQrPng);
  }

  return doc.output("arraybuffer");
}
