import { jsPDF } from "jspdf";
import { productionLineLabel, workstationId } from "@/lib/production/factory-workstations";

const LINE_COUNT = 8;
const MACHINE_COUNT = 9;

const PL_FILL = { r: 30, g: 41, b: 59 };

export type LabelMapLayout = "all" | "pairs";

type GridMetrics = {
  margin: number;
  titleH: number;
  plBadgeH: number;
  plGap: number;
  cols: number;
  colGap: number;
  labelAtTop: boolean;
};

function drawTitle(doc: jsPDF, pageW: number, margin: number, text: string) {
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text(text, pageW / 2, margin + 4, { align: "center" });
}

function drawColumn(
  doc: jsPDF,
  lineNumber: number,
  colX: number,
  metrics: GridMetrics,
  gridTop: number,
  cellW: number,
  cellH: number
) {
  for (let machineIndex = 0; machineIndex < MACHINE_COUNT; machineIndex += 1) {
    const stationNumber = MACHINE_COUNT - machineIndex;
    const label = workstationId(lineNumber, stationNumber);
    const x = colX + 0.5;
    const y = gridTop + machineIndex * cellH + 0.3;
    const w = cellW - 1;
    const h = cellH - 0.6;

    doc.setDrawColor(0);
    doc.setLineWidth(0.35);
    doc.setFillColor(255, 255, 255);
    doc.rect(x, y, w, h, "FD");

    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    if (metrics.labelAtTop) {
      doc.setFontSize(10);
      doc.text(label, x + w / 2, y + 5, { align: "center" });
    } else {
      doc.setFontSize(8);
      doc.text(label, x + w / 2, y + h / 2 + 1, { align: "center" });
    }
  }

  const plY = gridTop + MACHINE_COUNT * cellH + metrics.plGap;
  const plX = colX + 0.5;
  const plW = cellW - 1;

  doc.setDrawColor(255, 255, 255);
  doc.setFillColor(PL_FILL.r, PL_FILL.g, PL_FILL.b);
  doc.rect(plX, plY, plW, metrics.plBadgeH, "FD");

  doc.setFontSize(metrics.labelAtTop ? 10 : 9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(
    productionLineLabel(lineNumber),
    plX + plW / 2,
    plY + metrics.plBadgeH / 2 + 1,
    { align: "center" }
  );
}

function drawGridPage(
  doc: jsPDF,
  lineNumbers: number[],
  metrics: GridMetrics,
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

/** A4 landscape — all 8 columns on one page (compact overview). */
function drawAllLayout(doc: jsPDF) {
  const metrics: GridMetrics = {
    margin: 10,
    titleH: 10,
    plBadgeH: 7,
    plGap: 1.5,
    cols: LINE_COUNT,
    colGap: 0,
    labelAtTop: false,
  };

  drawGridPage(
    doc,
    Array.from({ length: LINE_COUNT }, (_, i) => i + 1),
    metrics,
    "Hagan factory — production line machine labels"
  );
}

/** A4 landscape — 4 pages, 2 production lines per page with tall cells for handwriting. */
function drawPairsLayout(doc: jsPDF) {
  const metrics: GridMetrics = {
    margin: 10,
    titleH: 8,
    plBadgeH: 7,
    plGap: 1.5,
    cols: 2,
    colGap: 14,
    labelAtTop: true,
  };

  const pagePairs: [number, number][] = [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
  ];

  pagePairs.forEach(([first, second], pageIndex) => {
    if (pageIndex > 0) doc.addPage();
    drawGridPage(
      doc,
      [first, second],
      metrics,
      `Hagan factory — ${productionLineLabel(first)} + ${productionLineLabel(second)}`
    );
  });
}

export function generateLabelMapPdf(layout: LabelMapLayout = "all"): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });

  if (layout === "pairs") {
    drawPairsLayout(doc);
  } else {
    drawAllLayout(doc);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
