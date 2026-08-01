import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { outlinePointsForPlacement } from "@/lib/pattern-library/dxf-parser";
import { formatMeasurementAscii, unitLabel } from "@/lib/pattern-library/measurements";
import {
  nestMapHeight,
  nestMapTransform,
} from "@/lib/pattern-library/nest-map-transform";
import {
  clientPatternLabelCode,
  clientPatternQrUrl,
} from "@/lib/pattern-library/pattern-qr";
import type { PatternSheetKind } from "@/lib/pattern-library/pattern-sheet-kind";
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

function drawBrandLetterhead(
  doc: jsPDF,
  houseBrand: PatternSheetData["house_brand"],
  options: { rightInsetMm?: number } = {}
): { brandH: number; brandX: number } {
  const brandCode = houseBrand.code ?? "-";
  const brandName = houseBrand.name ?? "House brand";
  const brandW = 38;
  const brandH = houseBrand.name ? 16 : 14;
  const rightInset = options.rightInsetMm ?? 0;
  const brandX = PAGE_W - MARGIN - brandW - rightInset;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.6);
  doc.rect(brandX, MARGIN, brandW, brandH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text(brandCode, brandX + brandW / 2, MARGIN + 7.5, { align: "center" });
  doc.setFontSize(6.5);
  doc.text(brandName.toUpperCase(), brandX + brandW / 2, MARGIN + 13, { align: "center" });
  return { brandH, brandX };
}

async function drawPatternLibraryQr(
  doc: jsPDF,
  pattern: PatternSheetData["pattern"],
  patternQrPng: Buffer
): Promise<{ size: number; labelLines: string[] }> {
  const patternQrLabel = clientPatternLabelCode(pattern);
  const patternQrSize = 18;
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
  return { size: patternQrSize, labelLines: patternLabelLines };
}

function drawHeaderRows(
  doc: jsPDF,
  rows: [string, string][],
  startY: number
): number {
  let headerY = startY;
  doc.setFontSize(8.5);
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SLATE);
    doc.text(label.toUpperCase(), MARGIN, headerY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    const wrapped = doc.splitTextToSize(value, PAGE_W - MARGIN * 2 - 30);
    doc.text(wrapped, MARGIN + 30, headerY);
    headerY += 5 * Math.max(1, wrapped.length);
  }
  return headerY;
}

function drawFabricSpec(doc: jsPDF, data: PatternSheetData, startY: number): number {
  const { fabric, pattern } = data;
  let y = startY;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  const ordered =
    fabric?.ordered_meters != null ? `Ordered: ${fabric.ordered_meters.toFixed(2)} m` : null;
  const fabricRows = fabric
    ? [
        [`Fabric: ${fabric.fabric_number}`, `Supplier: ${fabric.supplier_name}`, `Color: ${fabric.color ?? "-"}`],
        [
          `Composition: ${fabric.composition ?? "-"}`,
          `Weight: ${fabric.gsm ? `${fabric.gsm} gsm` : "-"}`,
          `Width: ${fabric.width_cm ? `${fabric.width_cm} cm` : fabric.width_inches ? `${fabric.width_inches}"` : "-"}`,
        ],
        ...(ordered ? [[ordered, "", ""]] : []),
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
  return y + fabricBoxH + 4;
}

function drawPrintedFooter(
  doc: jsPDF,
  data: PatternSheetData,
  startY: number,
  extra?: string
): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...SLATE);
  const footerBits = [
    `Printed ${new Date().toLocaleDateString("en-GB")}`,
    data.pattern.pattern_ref,
    `Trial ${data.version.version}${data.version.is_final ? " (Final)" : ""}`,
  ];
  if (extra) footerBits.push(extra);
  doc.text(footerBits.join(" - "), MARGIN, startY);
}

/** Cutter A4: identity, fabric, cut layout/parts, floor QR. No measurements / TUD thumb. */
async function drawCutterSheetPage(
  doc: jsPDF,
  data: PatternSheetData,
  sticker: PatternSheetSticker | null,
  pageIndex: number,
  pageTotal: number
): Promise<void> {
  const { pattern, version, order, job, house_brand } = data;

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("CUTTER SHEET", MARGIN, MARGIN + 5);
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

  const { brandH } = drawBrandLetterhead(doc, house_brand);

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.7);
  const ruleY = Math.max(titleExtraY + 4, MARGIN + Math.max(16, brandH + 2));
  doc.line(MARGIN, ruleY, PAGE_W - MARGIN, ruleY);

  const headerY = drawHeaderRows(
    doc,
    [
      ["Client", `${pattern.client_name} (${pattern.client_code})`],
      ["Garment", pattern.garment_type],
      [
        "Order",
        order
          ? `${order.so_number} - ordered ${formatDate(order.order_date)}${order.delivery_date ? ` - delivery ${formatDate(order.delivery_date)}` : ""}`
          : "-",
      ],
      [
        "Trial",
        `Trial ${version.version}${version.is_final ? " - FINAL" : ""} - ${formatDate(version.trial_date)}`,
      ],
    ],
    ruleY + 5
  );

  let y = drawFabricSpec(doc, data, headerY + 3);
  y = drawCutNestPreview(doc, data, y);

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
      `FLOOR SCAN QR - ${piecePageLabel(sticker).toUpperCase()}`,
      MARGIN + 3,
      y + 4
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...SLATE);
    doc.text("Cutter scans at cut. Same code is used later on the floor.", MARGIN + 3, y + 7.5);

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

  drawPrintedFooter(doc, data, y + 2, sticker?.production_code);
}

/** Production / stitcher A4: full measurements, notes, library QR, piece QRs. */
async function drawProductionSheetPage(
  doc: jsPDF,
  data: PatternSheetData,
  patternQrPng: Buffer
): Promise<void> {
  const {
    pattern,
    version,
    order,
    job,
    derived_from,
    house_brand,
    base_fill_warning,
    resolved_base_size,
    stickers,
  } = data;
  const unit = pattern.unit;

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("PRODUCTION / STITCHER SHEET", MARGIN, MARGIN + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...SLATE);
  doc.text(
    "Sewing handoff - measurements, instructions, piece codes for floor scan",
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

  const patternQr = await drawPatternLibraryQr(doc, pattern, patternQrPng);
  const { brandH } = drawBrandLetterhead(doc, house_brand, {
    rightInsetMm: patternQr.size + 4,
  });

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.7);
  const ruleY = Math.max(
    titleExtraY + 4,
    MARGIN + Math.max(16, brandH + 2, patternQr.size + 2 + patternQr.labelLines.length * 2)
  );
  doc.line(MARGIN, ruleY, PAGE_W - MARGIN, ruleY);

  let headerY = drawHeaderRows(
    doc,
    [
      ["Client", `${pattern.client_name} (${pattern.client_code})`],
      ["Garment", pattern.garment_type],
      ["Description", pattern.description ?? "-"],
      ["Origin", derived_from ?? "Custom"],
      [
        "Order",
        order
          ? `${order.so_number} - ordered ${formatDate(order.order_date)}${order.delivery_date ? ` - delivery ${formatDate(order.delivery_date)}` : ""}`
          : "-",
      ],
      [
        "Trial",
        `Trial ${version.version}${version.is_final ? " - FINAL" : ""} - ${formatDate(version.trial_date)}`,
      ],
    ],
    ruleY + 5
  );

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

  y = drawFabricSpec(doc, data, y);

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

  const trialNotes = version.notes?.trim();
  if (trialNotes) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SLATE);
    doc.text("TRIAL NOTES:", MARGIN, footerY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    const noteLines = doc.splitTextToSize(trialNotes, PAGE_W - MARGIN * 2 - 42);
    doc.text(noteLines, MARGIN + 42, footerY);
    footerY += 5 * Math.max(1, noteLines.length);
  }

  const patternNotes = pattern.notes?.trim();
  if (patternNotes) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SLATE);
    doc.text("PATTERN NOTES:", MARGIN, footerY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    const noteLines = doc.splitTextToSize(patternNotes, PAGE_W - MARGIN * 2 - 42);
    doc.text(noteLines, MARGIN + 42, footerY);
    footerY += 5 * Math.max(1, noteLines.length);
  }

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
  doc.text(
    "Linked client photos/sketches: use Print images on the pattern detail page.",
    MARGIN,
    footerY
  );
  footerY += 5;

  // Piece QRs for stitchers (all on this sheet; cutter sheet has per-piece pages)
  if (stickers.length > 0) {
    const qrSize = 22;
    const colW = (PAGE_W - MARGIN * 2) / Math.min(stickers.length, 4);
    const rowsNeeded = Math.ceil(stickers.length / 4);
    const boxH = 10 + rowsNeeded * (qrSize + 14);
    if (footerY + boxH > 280) {
      doc.addPage();
      footerY = MARGIN;
    }
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.5);
    doc.rect(MARGIN, footerY, PAGE_W - MARGIN * 2, boxH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...INK);
    doc.text("PIECE / FLOOR SCAN QR", MARGIN + 3, footerY + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...SLATE);
    doc.text("Stitchers scan the same codes as stickers / cutter sheet.", MARGIN + 3, footerY + 7.5);

    for (let i = 0; i < stickers.length; i++) {
      const sticker = stickers[i]!;
      const col = i % 4;
      const row = Math.floor(i / 4);
      const { png } = await renderQrPngBuffer(sticker.qr_payload, 280);
      const qrX = MARGIN + col * colW + (colW - qrSize) / 2;
      const qrY = footerY + 10 + row * (qrSize + 14);
      doc.addImage(
        `data:image/png;base64,${png.toString("base64")}`,
        "PNG",
        qrX,
        qrY,
        qrSize,
        qrSize
      );
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      doc.setTextColor(...INK);
      doc.text(stickerScanLabel(sticker).toUpperCase(), qrX + qrSize / 2, qrY + qrSize + 3, {
        align: "center",
      });
      doc.setFont("courier", "normal");
      doc.setFontSize(5);
      const codeLines = doc.splitTextToSize(sticker.production_code, colW - 4);
      doc.text(codeLines, qrX + qrSize / 2, qrY + qrSize + 6, { align: "center" });
    }
    footerY += boxH + 4;
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...SLATE);
    doc.text(
      "No manufacturing QRs linked (attach a fabric line with stickers).",
      MARGIN,
      footerY
    );
    footerY += 5;
  }

  drawPrintedFooter(doc, data, footerY + 2);
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

/** Draw active TUKAmrk (.tum) preview + -D metrics. Returns next Y, or startY if none. */
function drawTumMarkerPreview(doc: jsPDF, data: PatternSheetData, startY: number): number {
  const marker = data.marker;
  if (!marker) return startY;

  const tum = marker.tum;
  const boxW = PAGE_W - MARGIN * 2;
  let y = startY;
  const hasThumb = Boolean(marker.thumbnail_data_url);
  const thumbSize = hasThumb ? 28 : 0;
  const pieceRows = tum?.pieces ?? [];
  const rowH = 3.4;
  const metricsH = 14;
  const partsH =
    pieceRows.length > 0 ? 8 + Math.min(pieceRows.length, 12) * rowH + 2 : 0;
  const boxH = Math.max(metricsH + partsH + 4, hasThumb ? thumbSize + 10 : metricsH + 4);

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.35);
  doc.setFillColor(248, 250, 252);
  doc.rect(MARGIN, y, boxW, boxH, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...INK);
  doc.text("FABRIC CUT LAYOUT (FROM TUKAMRK)", MARGIN + 3, y + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...SLATE);
  const caption =
    tum?.style_caption ??
    marker.attachment.filename.replace(/\.[^.]+$/, "") ??
    marker.attachment.filename;
  doc.text(caption.slice(0, 70), MARGIN + 3, y + 8);

  const lengthM = tum?.length_cm != null ? tum.length_cm / 100 : null;
  const metricBits = [
    tum?.width_cm != null ? `width ${tum.width_cm.toFixed(1)} cm` : null,
    lengthM != null ? `length ${lengthM.toFixed(2)} m` : null,
    tum?.efficiency_pct != null ? `efficiency ${tum.efficiency_pct.toFixed(1)}%` : null,
    tum?.size ? `size ${tum.size}` : null,
    tum?.garment_qty != null ? `qty ${tum.garment_qty}` : null,
  ].filter(Boolean);
  doc.setTextColor(...INK);
  doc.setFontSize(7);
  doc.text(
    metricBits.length > 0
      ? metricBits.join(" - ")
      : "Shop marker attached (metrics unavailable).",
    MARGIN + 3,
    y + 12
  );

  if (hasThumb && marker.thumbnail_data_url) {
    const thumbX = PAGE_W - MARGIN - thumbSize - 3;
    const thumbY = y + 4;
    try {
      doc.addImage(marker.thumbnail_data_url, "JPEG", thumbX, thumbY, thumbSize, thumbSize);
    } catch {
      // Thumbnail decode can fail for odd JPEGs - metrics still print.
    }
  }

  if (pieceRows.length > 0) {
    let rowY = y + metricsH + 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(...SLATE);
    doc.text("PIECE", MARGIN + 3, rowY);
    doc.text("QTY", MARGIN + 48, rowY);
    doc.text("FABRIC", MARGIN + 58, rowY);
    doc.text("AREA m2", MARGIN + 88, rowY);
    rowY += 1.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...INK);
    for (const piece of pieceRows.slice(0, 12)) {
      rowY += rowH;
      const label = piece.code ? `${piece.name} ${piece.code}` : piece.name;
      doc.text(label.slice(0, 30), MARGIN + 3, rowY);
      doc.text(piece.cut_quantity != null ? String(piece.cut_quantity) : "-", MARGIN + 48, rowY);
      doc.text((piece.fabric ?? "-").slice(0, 12), MARGIN + 58, rowY);
      doc.text(
        piece.area_m2 != null ? piece.area_m2.toFixed(4) : "-",
        MARGIN + 88,
        rowY
      );
    }
    if (pieceRows.length > 12) {
      rowY += rowH;
      doc.setTextColor(...SLATE);
      doc.text(`+ ${pieceRows.length - 12} more pieces in marker file`, MARGIN + 3, rowY);
    }
  }

  return y + boxH + 3;
}

/** Draw approximate folded-fabric nest for the cutter. Returns next Y. */
function drawCutNestPreview(doc: jsPDF, data: PatternSheetData, startY: number): number {
  // Optional .tum archive path - only when a marker is actually attached.
  if (data.marker) {
    return drawTumMarkerPreview(doc, data, startY);
  }

  const preview = data.cut_nest;
  const boxW = PAGE_W - MARGIN * 2;
  let y = startY;

  // Parts table + fold instructions first (what the cutter actually uses).
  if (preview.cutter_plan) {
    y = drawCutterPartsFromTud(doc, preview.cutter_plan, y);
  }

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.35);

  if (!preview.nest) {
    const msg =
      preview.missing_reason ?? "Upload TUD + set fabric width for length estimate.";
    const lines = doc.splitTextToSize(msg, boxW - 6);
    const boxH = 8 + lines.length * 3.5;
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(217, 119, 6);
    doc.rect(MARGIN, y, boxW, boxH, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(120, 53, 15);
    doc.text("LENGTH ESTIMATE - NOT AVAILABLE", MARGIN + 3, y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...INK);
    doc.text(lines, MARGIN + 3, y + 8);
    return y + boxH + 3;
  }

  const nest = preview.nest;
  const hasDxf = Boolean(nest.has_dxf_outlines);
  const lengthCm = Math.max(
    (preview.board_length_m ?? nest.packed_length_m) * 100,
    nest.packed_length_m * 100,
    ...nest.placements.map((p) => p.x_cm + p.width_cm),
    1
  );
  const usableW = Math.max(nest.usable_width_cm, 1);
  const mapW = boxW - 6;
  // Cap height for A4, but draw with uniform scale (letterbox) so DXF outlines
  // match NestEstimatePanel proportions instead of being squashed flat.
  const mapH = nestMapHeight(mapW, lengthCm, usableW, { hasDxfOutlines: hasDxf });
  const headerH = 14;
  const footerH = 8;
  const boxH = headerH + mapH + footerH + 4;

  if (hasDxf) {
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(5, 150, 105);
  } else {
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(217, 119, 6);
  }
  doc.rect(MARGIN, y, boxW, boxH, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  const titleColor: [number, number, number] = hasDxf ? [6, 78, 59] : [120, 53, 15];
  doc.setTextColor(...titleColor);
  doc.text(
    hasDxf
      ? "FABRIC CUT LAYOUT - DXF PIECE OUTLINES"
      : "LENGTH ESTIMATE ONLY - NOT CAD OUTLINES",
    MARGIN + 3,
    y + 4
  );
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
      ? ` - ordered ${preview.ordered_length_m.toFixed(2)} m${
          preview.fits_on_order === true
            ? " (fits)"
            : preview.fits_on_order === false
              ? " (OVER)"
              : ""
        }`
      : "";
  doc.text(
    `${foldLabel} - usable ${nest.usable_width_cm} cm of ${nest.fabric_width_cm} cm - packed ~${nest.packed_length_m.toFixed(2)} m - size ${nest.size}${orderBit}${preview.source === "saved" ? " - saved" : ""}`,
    MARGIN + 3,
    y + 8
  );
  doc.text(
    hasDxf
      ? "Green shapes = DXF polylines. Nest uses bounding-box shelves - verify in TUKAmark before cutting."
      : "Green boxes = area/perimeter rectangles from TUD header. Cut from real TUKA pieces, not this map.",
    MARGIN + 3,
    y + 11.5
  );

  const mapX = MARGIN + 3;
  const mapY = y + headerH;
  // Outer map chrome (letterbox gutter) - not fabric length.
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(100, 116, 139);
  doc.rect(mapX, mapY, mapW, mapH, "FD");

  const { scale, offsetX, offsetY, contentW, contentH } = nestMapTransform(
    lengthCm,
    usableW,
    mapW,
    mapH
  );
  const originX = mapX + offsetX;
  const originY = mapY + offsetY;
  // Fabric strip only - same proportions as NestEstimatePanel board.
  doc.setFillColor(hasDxf ? 63 : 226, hasDxf ? 63 : 232, hasDxf ? 70 : 240);
  doc.setDrawColor(113, 113, 122);
  doc.rect(originX, originY, contentW, contentH, "FD");

  for (const p of nest.placements) {
    const rx = originX + p.x_cm * scale;
    const ry = originY + p.y_cm * scale;
    const rw = Math.max(p.width_cm * scale, 1.2);
    const rh = Math.max(p.height_cm * scale, 1.2);
    doc.setFillColor(167, 243, 208);
    doc.setDrawColor(22, 101, 52);
    doc.setLineWidth(0.45);

    const local = outlinePointsForPlacement(
      p.outline_cm,
      p,
      p.outline_width_cm ?? undefined
    );
    if (local && local.length >= 3) {
      const pts = local.map((pt) => ({
        x: originX + (p.x_cm + pt.x) * scale,
        y: originY + (p.y_cm + pt.y) * scale,
      }));
      // Closed polyline fill via relative segments (same outline as NestEstimatePanel).
      const segments: Array<[number, number]> = [];
      for (let i = 1; i < pts.length; i++) {
        segments.push([pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y]);
      }
      const first = pts[0]!;
      const last = pts[pts.length - 1]!;
      segments.push([first.x - last.x, first.y - last.y]);
      doc.lines(segments, first.x, first.y, [1, 1], "FD", true);
    } else {
      doc.setFillColor(255, 255, 255);
      doc.rect(rx, ry, rw, rh, "FD");
    }
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
    hasDxf
      ? `Packed ~${nest.packed_length_m.toFixed(2)} m - ${nest.placements.length} DXF pieces - ~${nest.efficiency_pct.toFixed(0)}% (bbox nest)`
      : `Est. packed ~${nest.packed_length_m.toFixed(2)} m - ${nest.placements.length} estimate rects - ~${nest.efficiency_pct.toFixed(0)}% (rough)`,
    MARGIN + 3,
    y + headerH + mapH + 4
  );

  return y + boxH + 3;
}

/** A4 portrait sheet - cutter (per piece) or production (full sewing detail). */
export async function generatePatternSheetPdf(
  data: PatternSheetData,
  kind: PatternSheetKind = "cutter"
): Promise<ArrayBuffer> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  if (kind === "production") {
    const { png: patternQrPng } = await renderQrPngBuffer(
      clientPatternQrUrl(data.pattern.id),
      300
    );
    await drawProductionSheetPage(doc, data, patternQrPng);
    return doc.output("arraybuffer");
  }

  const pages: Array<PatternSheetSticker | null> =
    data.stickers.length > 0 ? data.stickers : [null];

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) doc.addPage();
    await drawCutterSheetPage(doc, data, pages[i]!, i + 1, pages.length);
  }

  return doc.output("arraybuffer");
}
