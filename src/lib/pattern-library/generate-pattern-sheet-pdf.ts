import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { outlinePointsForPlacement } from "@/lib/pattern-library/dxf-parser";
import {
  formatMeasurementAsciiForDisplay,
  unitLabel,
} from "@/lib/pattern-library/measurements";
import type { MeasurementUnit } from "@/lib/types/pattern-library";
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
import { expandCutterPrintPages } from "@/lib/pattern-library/expand-cutter-print-pages";
import type {
  PatternSheetArticlePage,
  PatternSheetData,
  PatternSheetSticker,
} from "@/lib/pattern-library/sheet-data";

const MARGIN = 12;
/** Tighter margin for single-page production / stitcher sheets. */
const PROD_MARGIN = 8;
const PAGE_W = 210;
const PAGE_H = 297;
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
  options: { rightInsetMm?: number; marginMm?: number; compact?: boolean } = {}
): { brandH: number; brandX: number } {
  const brandCode = houseBrand.code ?? "-";
  const brandName = houseBrand.name ?? "House brand";
  const margin = options.marginMm ?? MARGIN;
  const compact = Boolean(options.compact);
  const brandW = compact ? 30 : 38;
  const brandH = compact ? (houseBrand.name ? 12 : 10) : houseBrand.name ? 16 : 14;
  const rightInset = options.rightInsetMm ?? 0;
  const brandX = PAGE_W - margin - brandW - rightInset;
  doc.setDrawColor(...INK);
  doc.setLineWidth(compact ? 0.45 : 0.6);
  doc.rect(brandX, margin, brandW, brandH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(compact ? 12 : 16);
  doc.setTextColor(...INK);
  doc.text(brandCode, brandX + brandW / 2, margin + (compact ? 5.5 : 7.5), { align: "center" });
  doc.setFontSize(compact ? 5 : 6.5);
  doc.text(
    brandName.toUpperCase(),
    brandX + brandW / 2,
    margin + (compact ? 10 : 13),
    { align: "center" }
  );
  return { brandH, brandX };
}

async function drawPatternLibraryQr(
  doc: jsPDF,
  pattern: PatternSheetData["pattern"],
  patternQrPng: Buffer,
  options: { marginMm?: number; sizeMm?: number } = {}
): Promise<{ size: number; labelLines: string[] }> {
  const patternQrLabel = clientPatternLabelCode(pattern);
  const margin = options.marginMm ?? MARGIN;
  const patternQrSize = options.sizeMm ?? 18;
  const patternQrX = PAGE_W - margin - patternQrSize;
  doc.addImage(
    `data:image/png;base64,${patternQrPng.toString("base64")}`,
    "PNG",
    patternQrX,
    margin,
    patternQrSize,
    patternQrSize
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(3.5);
  doc.setTextColor(...SLATE);
  doc.text("PATTERN LIBRARY", patternQrX + patternQrSize / 2, margin + patternQrSize + 1.8, {
    align: "center",
  });
  doc.setFont("courier", "normal");
  doc.setFontSize(3.5);
  doc.setTextColor(...INK);
  const patternLabelLines = doc.splitTextToSize(patternQrLabel, patternQrSize + 4);
  doc.text(patternLabelLines, patternQrX + patternQrSize / 2, margin + patternQrSize + 3.8, {
    align: "center",
  });
  return { size: patternQrSize, labelLines: patternLabelLines };
}

function drawHeaderRows(
  doc: jsPDF,
  rows: [string, string][],
  startY: number,
  options: { marginMm?: number; fontSize?: number; rowMm?: number; labelW?: number } = {}
): number {
  const margin = options.marginMm ?? MARGIN;
  const fontSize = options.fontSize ?? 8.5;
  const rowMm = options.rowMm ?? 5;
  const labelW = options.labelW ?? 30;
  let headerY = startY;
  doc.setFontSize(fontSize);
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SLATE);
    doc.text(label.toUpperCase(), margin, headerY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    const wrapped = doc.splitTextToSize(value, PAGE_W - margin * 2 - labelW);
    doc.text(wrapped, margin + labelW, headerY);
    headerY += rowMm * Math.max(1, wrapped.length);
  }
  return headerY;
}

function drawFabricSpec(
  doc: jsPDF,
  data: PatternSheetData,
  startY: number,
  options: { marginMm?: number; compact?: boolean } = {}
): number {
  const { fabric, pattern } = data;
  const margin = options.marginMm ?? MARGIN;
  const compact = Boolean(options.compact);
  let y = startY;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  const ordered =
    fabric?.ordered_meters != null ? `Ordered: ${fabric.ordered_meters.toFixed(2)} m` : null;
  if (compact) {
    const line1 = fabric
      ? [
          `Fabric: ${fabric.fabric_number}`,
          `Supplier: ${fabric.supplier_name}`,
          `Color: ${fabric.color ?? "-"}`,
          fabric.gsm ? `${fabric.gsm} gsm` : null,
          fabric.width_cm
            ? `${fabric.width_cm} cm`
            : fabric.width_inches
              ? `${fabric.width_inches}"`
              : null,
          ordered,
        ]
          .filter(Boolean)
          .join("  |  ")
      : pattern.fabric
        ? `Fabric: ${pattern.fabric}`
        : "No linked order fabric line.";
    const line2 = fabric?.composition ? `Composition: ${fabric.composition}` : null;
    const boxH = line2 ? 11 : 8;
    doc.rect(margin, y, PAGE_W - margin * 2, boxH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(...SLATE);
    doc.text("FABRIC", margin + 2, y + 3.2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(line1, PAGE_W - margin * 2 - 4), margin + 2, y + 6.5);
    if (line2) {
      doc.setFontSize(6);
      doc.text(doc.splitTextToSize(line2, PAGE_W - margin * 2 - 4), margin + 2, y + 9.5);
    }
    return y + boxH + 2.5;
  }
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
  doc.rect(margin, y, PAGE_W - margin * 2, fabricBoxH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...SLATE);
  doc.text("FABRIC SPECIFICATION", margin + 3, y + 4.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  fabricRows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell) doc.text(cell, margin + 3 + colIndex * 62, y + 9.5 + rowIndex * 5);
    });
  });
  return y + fabricBoxH + 4;
}

function drawPrintedFooter(
  doc: jsPDF,
  data: PatternSheetData,
  startY: number,
  extra?: string,
  options: { marginMm?: number; fontSize?: number } = {}
): void {
  const margin = options.marginMm ?? MARGIN;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(options.fontSize ?? 6.5);
  doc.setTextColor(...SLATE);
  const footerBits = [
    `Printed ${new Date().toLocaleDateString("en-GB")}`,
    data.pattern.pattern_ref,
    `Trial ${data.version.version}${data.version.is_final ? " (Final)" : ""}`,
  ];
  if (extra) footerBits.push(extra);
  doc.text(footerBits.join(" - "), margin, startY);
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

/**
 * Production / stitcher A4: measurements, instructions, library + piece QRs.
 * Always one page - densifies table/QRs rather than spilling to page 2.
 * Omits Description (often a noisy import path).
 */
async function drawProductionSheetPage(
  doc: jsPDF,
  data: PatternSheetData,
  patternQrPng: Buffer,
  options: {
    sewing?: boolean;
    article?: PatternSheetArticlePage | null;
    pageIndex?: number;
    pageTotal?: number;
    displayUnit?: MeasurementUnit;
  } = {}
): Promise<void> {
  const article = options.article ?? null;
  const {
    pattern,
    version,
    job,
    derived_from,
    house_brand,
    base_fill_warning,
    resolved_base_size,
  } = data;
  const order = article?.order ?? data.order;
  const stickers = article?.stickers ?? data.stickers;
  const pageData: PatternSheetData = article
    ? { ...data, fabric: article.fabric, stickers, order }
    : data;
  const storedUnit = pattern.unit;
  const displayUnit = options.displayUnit ?? storedUnit;
  const m = PROD_MARGIN;
  const contentBottom = PAGE_H - m - 5;
  const title = options.sewing ? "SEWING / STITCHER SHEET" : "PRODUCTION / STITCHER SHEET";

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(title, m, m + 3.5);
  doc.setTextColor(...INK);
  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.text(pattern.pattern_ref, m, m + 9);
  let titleExtraY = m + 9;
  if (article) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    titleExtraY += 4;
    const pageBit =
      options.pageIndex != null && options.pageTotal != null && options.pageTotal > 1
        ? ` · page ${options.pageIndex}/${options.pageTotal}`
        : "";
    doc.text(`Article ${article.article_code}${pageBit}`, m, titleExtraY);
  }
  if (job?.pattern_code) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...SLATE);
    titleExtraY += 3.5;
    doc.text(`TUD: ${job.pattern_code}`, m, titleExtraY);
    doc.setTextColor(...INK);
  }

  const patternQr = await drawPatternLibraryQr(doc, pattern, patternQrPng, {
    marginMm: m,
    sizeMm: 14,
  });
  const { brandH } = drawBrandLetterhead(doc, house_brand, {
    rightInsetMm: patternQr.size + 3,
    marginMm: m,
    compact: true,
  });

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  const ruleY = Math.max(
    titleExtraY + 2.5,
    m + Math.max(12, brandH + 1.5, patternQr.size + 1.5 + patternQr.labelLines.length * 1.6)
  );
  doc.line(m, ruleY, PAGE_W - m, ruleY);

  const metaRows: [string, string][] = [
    ["Client", `${pattern.client_name} (${pattern.client_code})`],
    ["Garment", article?.garment_type || pattern.garment_type],
    ...(article ? ([["Article", article.article_code]] as [string, string][]) : []),
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
  ];
  let headerY = drawHeaderRows(doc, metaRows, ruleY + 3.5, {
    marginMm: m,
    fontSize: 7,
    rowMm: 3.6,
    labelW: 22,
  });

  let y = headerY + 2;
  if (base_fill_warning) {
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(251, 191, 36);
    doc.setLineWidth(0.3);
    const warnLines = doc.splitTextToSize(base_fill_warning, PAGE_W - m * 2 - 4);
    const warnH = 3 + warnLines.length * 3.2;
    doc.rect(m, y, PAGE_W - m * 2, warnH, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(120, 53, 15);
    doc.text(warnLines, m + 2, y + 2.8);
    y += warnH + 2;
  }

  y = drawFabricSpec(doc, pageData, y, { marginMm: m, compact: true });

  // Reserve space for instructions + piece QRs + footer so the table densifies into page 1.
  const stickerCount = stickers.length;
  const qrColsGuess = Math.min(Math.max(stickerCount, 1), 6);
  const qrRowsGuess = stickerCount > 0 ? Math.ceil(stickerCount / qrColsGuess) : 0;
  const qrReserve = stickerCount > 0 ? 8 + qrRowsGuess * 20 : 3;
  const notesReserve = 12 + (version.notes?.trim() ? 3.5 : 0) + (pattern.notes?.trim() ? 3.5 : 0);
  const tableBudget = Math.max(36, contentBottom - y - qrReserve - notesReserve);
  const measurements = version.measurements;
  const rowCount = Math.max(measurements.length, 1);
  // Two side-by-side tables when a single dense column would still be too tall.
  const useTwoCol = rowCount > 28 || tableBudget / rowCount < 3.4;
  const rowsPerCol = useTwoCol ? Math.ceil(rowCount / 2) : rowCount;
  const headH = 4;
  const bodyBudget = Math.max(18, tableBudget - headH);
  const targetRowH = bodyBudget / rowsPerCol;
  const fontSize = targetRowH >= 4 ? 6.5 : targetRowH >= 3.4 ? 5.8 : targetRowH >= 2.9 ? 5.2 : 4.8;
  const cellPadding = targetRowH >= 4 ? 0.9 : targetRowH >= 3.4 ? 0.55 : targetRowH >= 2.9 ? 0.35 : 0.25;
  const gap = useTwoCol ? 2 : 0;
  const tableW = useTwoCol ? (PAGE_W - m * 2 - gap) / 2 : PAGE_W - m * 2;

  const baseCol = resolved_base_size
    ? `Base (${resolved_base_size})`
    : pattern.base_size
      ? `Base (${pattern.base_size})`
      : "Base";
  const head = [[
    `Meas. (${unitLabel(displayUnit)})`,
    baseCol,
    "Tgt",
    "Sewn",
    "+/-",
    "Rmk",
  ]];
  const toBodyRow = (row: (typeof measurements)[number]) => [
    row.remark ? `${row.name} - ${row.remark}` : row.name,
    formatMeasurementAsciiForDisplay(row.base_value, storedUnit, displayUnit),
    formatMeasurementAsciiForDisplay(row.target_value, storedUnit, displayUnit),
    formatMeasurementAsciiForDisplay(row.sewn_value, storedUnit, displayUnit),
    row.adjustment !== null
      ? `${row.adjustment > 0 ? "+" : row.adjustment < 0 ? "-" : ""}${formatMeasurementAsciiForDisplay(Math.abs(row.adjustment), storedUnit, displayUnit)}`
      : "-",
    (row.remarks ?? "").slice(0, 28),
  ];
  const tableStyles = {
    fontSize,
    cellPadding,
    textColor: INK,
    overflow: "ellipsize" as const,
    minCellHeight: Math.min(4.2, Math.max(2.6, targetRowH * 0.9)),
  };
  const headStyles = {
    fillColor: NAVY,
    textColor: [255, 255, 255] as [number, number, number],
    fontStyle: "bold" as const,
    fontSize: Math.max(4.5, fontSize - 0.4),
    cellPadding: Math.max(0.25, cellPadding * 0.75),
  };
  const columnStyles = {
    0: { cellWidth: tableW * 0.38 },
    1: { halign: "center" as const, cellWidth: tableW * 0.12 },
    2: { halign: "center" as const, cellWidth: tableW * 0.12, fontStyle: "bold" as const },
    3: { halign: "center" as const, cellWidth: tableW * 0.12 },
    4: { halign: "center" as const, cellWidth: tableW * 0.1 },
    5: { cellWidth: tableW * 0.16 },
  };

  if (useTwoCol) {
    const mid = Math.ceil(measurements.length / 2);
    const left = measurements.slice(0, mid);
    const right = measurements.slice(mid);
    autoTable(doc, {
      startY: y,
      margin: { left: m, right: m + tableW + gap },
      tableWidth: tableW,
      head,
      body: left.map(toBodyRow),
      styles: tableStyles,
      headStyles,
      columnStyles,
      theme: "grid",
    });
    const leftFinalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY;
    autoTable(doc, {
      startY: y,
      margin: { left: m + tableW + gap, right: m },
      tableWidth: tableW,
      head,
      body: right.map(toBodyRow),
      styles: tableStyles,
      headStyles,
      columnStyles,
      theme: "grid",
    });
    const rightFinalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY;
    y = Math.max(leftFinalY, rightFinalY);
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: m, right: m },
      tableWidth: tableW,
      head,
      body: measurements.map(toBodyRow),
      styles: tableStyles,
      headStyles,
      columnStyles,
      theme: "grid",
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  }

  let footerY = y + 3;
  const labelW = 34;
  const drawNoteLine = (label: string, text: string) => {
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SLATE);
    doc.text(label, m, footerY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(text, PAGE_W - m * 2 - labelW);
    // Cap note lines so QRs still fit on page 1.
    const capped = lines.slice(0, 3);
    doc.text(capped, m + labelW, footerY);
    footerY += 3.4 * Math.max(1, capped.length);
  };

  drawNoteLine(
    "STITCHER COMMENTS:",
    version.special_instructions || pattern.special_instructions || "-"
  );
  const trialNotes = version.notes?.trim();
  if (trialNotes) drawNoteLine("SHEET NOTES:", trialNotes);
  const patternNotes = pattern.notes?.trim();
  if (patternNotes) drawNoteLine("PATTERN NOTES:", patternNotes);
  if (pattern.physical_pattern_kept) {
    drawNoteLine(
      "PHYSICAL:",
      `kept${pattern.physical_pattern_location ? ` - ${pattern.physical_pattern_location}` : ""}`
    );
  }

  if (stickers.length > 0) {
    const remaining = Math.max(18, contentBottom - footerY - 4);
    const cols = Math.min(stickers.length, remaining < 28 ? 6 : stickers.length <= 4 ? stickers.length : 5);
    const rowsNeeded = Math.ceil(stickers.length / cols);
    const headerBlock = 6.5;
    const labelBlock = 7;
    const qrSize = Math.max(
      10,
      Math.min(16, (remaining - headerBlock - 2) / rowsNeeded - labelBlock)
    );
    const boxH = Math.min(remaining, headerBlock + rowsNeeded * (qrSize + labelBlock));
    const colW = (PAGE_W - m * 2) / cols;

    doc.setDrawColor(...INK);
    doc.setLineWidth(0.4);
    doc.rect(m, footerY, PAGE_W - m * 2, boxH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(...INK);
    doc.text("PIECE / FLOOR SCAN QR", m + 2, footerY + 3.2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.setTextColor(...SLATE);
    doc.text("Same codes as stickers / cutter sheet.", m + 2, footerY + 5.8);

    for (let i = 0; i < stickers.length; i++) {
      const sticker = stickers[i]!;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const { png } = await renderQrPngBuffer(sticker.qr_payload, 220);
      const qrX = m + col * colW + (colW - qrSize) / 2;
      const qrY = footerY + headerBlock + row * (qrSize + labelBlock);
      if (qrY + qrSize > footerY + boxH - 1) break;
      doc.addImage(
        `data:image/png;base64,${png.toString("base64")}`,
        "PNG",
        qrX,
        qrY,
        qrSize,
        qrSize
      );
      doc.setFont("helvetica", "bold");
      doc.setFontSize(4.5);
      doc.setTextColor(...INK);
      doc.text(stickerScanLabel(sticker).toUpperCase(), qrX + qrSize / 2, qrY + qrSize + 2.2, {
        align: "center",
      });
      doc.setFont("courier", "normal");
      doc.setFontSize(4);
      const codeLines = doc.splitTextToSize(sticker.production_code, colW - 2);
      doc.text(codeLines.slice(0, 2), qrX + qrSize / 2, qrY + qrSize + 4.4, { align: "center" });
    }
    footerY += boxH + 2;
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...SLATE);
    doc.text("No manufacturing QRs linked.", m, footerY);
    footerY += 3.5;
  }

  drawPrintedFooter(doc, data, Math.min(footerY + 1, PAGE_H - m), undefined, {
    marginMm: m,
    fontSize: 5.5,
  });
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

async function buildPatternSheetDoc(
  data: PatternSheetData,
  kind: PatternSheetKind,
  displayUnit?: MeasurementUnit
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  if (kind === "production") {
    const { png: patternQrPng } = await renderQrPngBuffer(
      clientPatternQrUrl(data.pattern.id),
      240
    );
    await drawProductionSheetPage(doc, data, patternQrPng, { displayUnit });
    return doc;
  }

  if (kind === "sewing") {
    const { png: patternQrPng } = await renderQrPngBuffer(
      clientPatternQrUrl(data.pattern.id),
      240
    );
    const pages =
      data.article_pages.length > 0
        ? data.article_pages
        : ([
            {
              line_id: "primary",
              article_code: data.pattern.pattern_ref,
              garment_type: data.pattern.garment_type,
              so_number: data.order?.so_number ?? "",
              order: data.order ?? {
                so_number: "-",
                order_date: null,
                delivery_date: null,
              },
              fabric: data.fabric ?? {
                fabric_number: data.pattern.fabric ?? "-",
                supplier_name: "-",
                composition: null,
                gsm: null,
                width_cm: null,
                width_inches: null,
                color: null,
              },
              stickers: data.stickers,
            },
          ] satisfies PatternSheetArticlePage[]);
    for (let i = 0; i < pages.length; i++) {
      if (i > 0) doc.addPage();
      await drawProductionSheetPage(doc, data, patternQrPng, {
        sewing: true,
        article: pages[i]!,
        pageIndex: i + 1,
        pageTotal: pages.length,
        displayUnit,
      });
    }
    return doc;
  }

  const pages = expandCutterPrintPages(data);

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    if (i > 0) doc.addPage();
    await drawCutterSheetPage(
      doc,
      page.data,
      page.sticker,
      page.pageIndex,
      page.pageTotal
    );
  }

  return doc;
}

/** A4 portrait sheet - cutter, production, or sewing pack (one page per article). */
export async function generatePatternSheetPdf(
  data: PatternSheetData,
  kind: PatternSheetKind = "cutter",
  options: { displayUnit?: MeasurementUnit } = {}
): Promise<ArrayBuffer> {
  const doc = await buildPatternSheetDoc(data, kind, options.displayUnit);
  return doc.output("arraybuffer");
}

/** Page count for generated sheet (tests assert production === 1). */
export async function patternSheetPdfPageCount(
  data: PatternSheetData,
  kind: PatternSheetKind = "cutter",
  options: { displayUnit?: MeasurementUnit } = {}
): Promise<number> {
  const doc = await buildPatternSheetDoc(data, kind, options.displayUnit);
  return doc.getNumberOfPages();
}
