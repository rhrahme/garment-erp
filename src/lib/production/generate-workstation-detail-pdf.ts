import { jsPDF } from "jspdf";
import {
  FACTORY_WORKSTATIONS,
  productionLineLabel,
  workstationId,
  type FactoryWorkstation,
} from "@/lib/production/factory-workstations";

const LINE_COUNT = 8;
const MACHINE_COUNT = 9;

const PL_FILL = { r: 30, g: 41, b: 59 };
const MUTED = { r: 100, g: 116, b: 139 };

export type WorkstationDetailLayout = "all" | "pairs";

type DetailMetrics = {
  margin: number;
  titleH: number;
  plBadgeH: number;
  plGap: number;
  cols: number;
  colGap: number;
  idFontSize: number;
  labelFontSize: number;
  useFontSize: number;
  refFontSize: number;
  lineHeight: number;
  cardPad: number;
};

function workstationFor(lineNumber: number, stationNumber: number): FactoryWorkstation | undefined {
  const id = workstationId(lineNumber, stationNumber);
  return FACTORY_WORKSTATIONS.find((ws) => ws.id === id);
}

function drawTitle(doc: jsPDF, pageW: number, margin: number, text: string) {
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text(text, pageW / 2, margin + 4, { align: "center" });
}

function drawDetailCard(
  doc: jsPDF,
  ws: FactoryWorkstation | undefined,
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  metrics: DetailMetrics
) {
  const { idFontSize, labelFontSize, useFontSize, refFontSize, lineHeight, cardPad } = metrics;

  doc.setDrawColor(180);
  doc.setLineWidth(0.4);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, "FD");

  let cursorY = y + cardPad + idFontSize * 0.35;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(idFontSize);
  doc.setTextColor(0);
  doc.text(id, x + w / 2, cursorY, { align: "center" });
  cursorY += lineHeight + 1;

  const innerW = w - cardPad * 2;
  const textX = x + cardPad;

  doc.setFontSize(labelFontSize);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text("Machine use", textX, cursorY);
  cursorY += lineHeight * 0.85;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(useFontSize);
  doc.setTextColor(0);
  const useText = ws?.machine_use?.trim() || "—";
  const useLines = doc.splitTextToSize(useText, innerW);
  const maxUseLines = metrics.cols >= 2 ? 2 : 3;
  doc.text(useLines.slice(0, maxUseLines), textX, cursorY);
  cursorY += Math.min(useLines.length, maxUseLines) * lineHeight + 0.8;

  doc.setFontSize(labelFontSize);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text("Model / reference", textX, cursorY);
  cursorY += lineHeight * 0.85;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(refFontSize);
  doc.setTextColor(0);
  const refText = ws?.machine_reference?.trim() || "—";
  const refLines = doc.splitTextToSize(refText, innerW);
  doc.text(refLines.slice(0, 2), textX, cursorY);
}

function drawColumn(
  doc: jsPDF,
  lineNumber: number,
  colX: number,
  metrics: DetailMetrics,
  gridTop: number,
  cellW: number,
  cellH: number
) {
  const cardGap = 0.8;

  for (let machineIndex = 0; machineIndex < MACHINE_COUNT; machineIndex += 1) {
    const stationNumber = MACHINE_COUNT - machineIndex;
    const id = workstationId(lineNumber, stationNumber);
    const ws = workstationFor(lineNumber, stationNumber);
    const cardH = cellH - cardGap;
    const x = colX;
    const y = gridTop + machineIndex * cellH + cardGap / 2;

    drawDetailCard(doc, ws, id, x, y, cellW, cardH, metrics);
  }

  const plY = gridTop + MACHINE_COUNT * cellH + metrics.plGap;
  doc.setDrawColor(255, 255, 255);
  doc.setFillColor(PL_FILL.r, PL_FILL.g, PL_FILL.b);
  doc.roundedRect(colX, plY, cellW, metrics.plBadgeH, 1.5, 1.5, "F");

  doc.setFontSize(metrics.cols >= 2 ? 12 : 14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(
    productionLineLabel(lineNumber),
    colX + cellW / 2,
    plY + metrics.plBadgeH / 2 + 1.2,
    { align: "center" }
  );
}

function drawDetailPage(
  doc: jsPDF,
  lineNumbers: number[],
  metrics: DetailMetrics,
  title: string
) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const { margin, titleH, plBadgeH, plGap, cols, colGap } = metrics;

  drawTitle(doc, pageW, margin, title);

  const gridTop = margin + titleH;
  const totalColGap = colGap * (cols - 1);
  const cellW = (pageW - margin * 2 - totalColGap) / cols;
  const cellH = (pageH - margin * 2 - titleH - plBadgeH - plGap) / MACHINE_COUNT;

  lineNumbers.forEach((lineNumber, index) => {
    const colX = margin + index * (cellW + colGap);
    drawColumn(doc, lineNumber, colX, metrics, gridTop, cellW, cellH);
  });
}

/** A4 landscape — 4 pages, 2 production lines per page (PL1+PL2, …). */
function drawPairsLayout(doc: jsPDF) {
  const metrics: DetailMetrics = {
    margin: 10,
    titleH: 10,
    plBadgeH: 9,
    plGap: 2,
    cols: 2,
    colGap: 12,
    idFontSize: 13,
    labelFontSize: 6,
    useFontSize: 8,
    refFontSize: 8.5,
    lineHeight: 3.2,
    cardPad: 2.5,
  };

  const pagePairs: [number, number][] = [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
  ];

  pagePairs.forEach(([first, second], pageIndex) => {
    if (pageIndex > 0) doc.addPage();
    drawDetailPage(
      doc,
      [first, second],
      metrics,
      `Hagan factory — workstation details (${productionLineLabel(first)} + ${productionLineLabel(second)})`
    );
  });
}

/** A4 landscape — 8 pages, one production line per page with wide detail cards. */
function drawAllLayout(doc: jsPDF) {
  const metrics: DetailMetrics = {
    margin: 12,
    titleH: 10,
    plBadgeH: 10,
    plGap: 2,
    cols: 1,
    colGap: 0,
    idFontSize: 16,
    labelFontSize: 7,
    useFontSize: 10,
    refFontSize: 10.5,
    lineHeight: 3.6,
    cardPad: 3,
  };

  for (let lineNumber = 1; lineNumber <= LINE_COUNT; lineNumber += 1) {
    if (lineNumber > 1) doc.addPage();
    drawDetailPage(
      doc,
      [lineNumber],
      metrics,
      `Hagan factory — workstation details (${productionLineLabel(lineNumber)})`
    );
  }
}

export function generateWorkstationDetailPdf(
  layout: WorkstationDetailLayout = "pairs"
): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });

  if (layout === "all") {
    drawAllLayout(doc);
  } else {
    drawPairsLayout(doc);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
