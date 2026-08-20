import { jsPDF } from "jspdf";
import {
  BADGE_CARD_HEIGHT_MM,
  BADGE_CARD_WIDTH_MM,
  BADGE_CARDS_PER_PAGE,
  BADGE_CARDS_PER_ROW,
  BADGE_QR_FETCH_PX,
  BADGE_QR_GAP_MM,
  BADGE_ROWS_PER_PAGE,
  badgeCardIndexLabel,
  badgeCardJobsLine,
  badgeDisplayName,
  badgeJobFunctionsLine,
  badgePrintDateLabel,
  badgeQrRowLayout,
  type BadgeQrSide,
  chunkBadgePages,
  expandBadgePrintCards,
} from "@/lib/hr/badge-print";
import type { IdBadgeGroup } from "@/lib/hr/payroll-utils";
import { qrImageFetchUrl } from "@/lib/production/qr-labels";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

/** Hagan corporate navy - solid dark blue for badge chrome. */
export const BADGE_NAVY = "#0B2C5A";

const COMPANY_NAME = "HAGAN INDUSTRIAL COMPANY";
const PAGE_MARGIN_MM = 8;
const GAP_X_MM = 8;
const GAP_Y_MM = 6;
const COMPANY_BAND_H_MM = 7;
const CROP_ARM_MM = 2.5;
const CROP_THICK_MM = 0.25;
const CROP_GAP_MM = 0.5;

async function fetchQrDataUrl(payload: string): Promise<string> {
  const res = await fetch(qrImageFetchUrl(payload, BADGE_QR_FETCH_PX));
  if (!res.ok) throw new Error("Failed to load QR code image.");
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function drawCropMarks(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(CROP_THICK_MM);
  const g = CROP_GAP_MM;
  const a = CROP_ARM_MM;
  // top-left
  doc.line(x - g - a, y, x - g, y);
  doc.line(x, y - g - a, x, y - g);
  // top-right
  doc.line(x + w + g, y, x + w + g + a, y);
  doc.line(x + w, y - g - a, x + w, y - g);
  // bottom-left
  doc.line(x - g - a, y + h, x - g, y + h);
  doc.line(x, y + h + g, x, y + h + g + a);
  // bottom-right
  doc.line(x + w + g, y + h, x + w + g + a, y + h);
  doc.line(x + w, y + h + g, x + w, y + h + g + a);
}

function drawBadgeCard(
  doc: jsPDF,
  employee: PayrollEmployee,
  group: IdBadgeGroup,
  sides: Array<BadgeQrSide & { dataUrl: string }>,
  x: number,
  y: number,
  printedLabel: string,
  cardIndex = 1,
  cardCount = 1
) {
  const w = BADGE_CARD_WIDTH_MM;
  const h = BADGE_CARD_HEIGHT_MM;

  drawCropMarks(doc, x, y, w, h);

  // Card border
  doc.setDrawColor(BADGE_NAVY);
  doc.setLineWidth(0.35);
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, w, h, "FD");

  // Company band
  doc.setFillColor(BADGE_NAVY);
  doc.rect(x, y, w, COMPANY_BAND_H_MM, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(COMPANY_NAME, x + w / 2, y + COMPANY_BAND_H_MM / 2 + 1.1, {
    align: "center",
  });

  const bodyY = y + COMPANY_BAND_H_MM;
  const bodyH = h - COMPANY_BAND_H_MM;
  const textX = x + 2.5;
  const textMaxW = w - 5;
  let textY = bodyY + 3.2;

  if (group === "saudi") {
    doc.setTextColor(BADGE_NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("SAUDI", textX, textY);
    textY += 3.2;
  }

  const jobsLine =
    cardCount > 1 ? badgeCardJobsLine(sides) : badgeJobFunctionsLine(employee);

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const nameLines = doc.splitTextToSize(badgeDisplayName(employee), textMaxW);
  doc.text(nameLines.slice(0, jobsLine ? 1 : 2), textX, textY);
  textY += Math.min(nameLines.length, jobsLine ? 1 : 2) * 3.8;

  if (jobsLine) {
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const jobLines = doc.splitTextToSize(jobsLine, textMaxW);
    doc.text(jobLines.slice(0, 1), textX, textY + 0.4);
  }

  // Footer reserved at bottom of card
  const printY = y + h - 2.8;
  const idY = printY - 3.8;
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.text("EMPLOYEE ID", textX, idY - 3.2);
  doc.setTextColor(11, 44, 90);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(employee.employee_id_number, textX, idY, {
    maxWidth: textMaxW,
  });
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  const cardLabel = badgeCardIndexLabel(cardIndex, cardCount);
  doc.text(cardLabel ? `${printedLabel} - ${cardLabel}` : printedLabel, textX, printY, {
    maxWidth: textMaxW,
  });

  const layout = badgeQrRowLayout(sides.length);
  if (layout.count === 2 && Math.abs(layout.gapMm - BADGE_QR_GAP_MM) > 0.01) {
    throw new Error(
      `Badge QR gap ${layout.gapMm.toFixed(1)}mm must equal ${BADGE_QR_GAP_MM}mm (3cm).`
    );
  }

  const footerTop = idY - 4.5;
  const qrBlockH = layout.sizeMm + 3.5;
  const qrY = bodyY + Math.max(
    textY + 1.5,
    (footerTop + textY) / 2 - qrBlockH / 2
  );
  const rowX = x + (w - layout.rowWidthMm) / 2;
  const qrDrawY = Math.min(qrY, footerTop - qrBlockH);

  sides.forEach((side, index) => {
    const drawX = rowX + index * (layout.sizeMm + layout.gapMm);
    doc.addImage(side.dataUrl, "PNG", drawX, qrDrawY, layout.sizeMm, layout.sizeMm);
    if (side.kind === "alteration") {
      doc.setDrawColor(180, 83, 9);
      doc.setLineWidth(0.45);
    } else {
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
    }
    doc.rect(drawX, qrDrawY, layout.sizeMm, layout.sizeMm);
    doc.setTextColor(side.kind === "alteration" ? 146 : 51, side.kind === "alteration" ? 64 : 65, side.kind === "alteration" ? 14 : 85);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.text(side.label, drawX + layout.sizeMm / 2, qrDrawY + layout.sizeMm + 2.2, {
      align: "center",
    });
  });
  doc.setLineWidth(0.2);
}

/**
 * A4 portrait PDF - 2x5 CR80 badge cards with crop marks (matches print sheet).
 */
export async function generateEmployeeBadgePdf(
  employees: PayrollEmployee[],
  group: IdBadgeGroup
): Promise<Uint8Array> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const cards = expandBadgePrintCards(employees);
  const pages = chunkBadgePages(cards, BADGE_CARDS_PER_PAGE);
  const qrCache = new Map<string, string>();
  const printedLabel = badgePrintDateLabel();

  if (pages.length === 0) {
    doc.setFontSize(12);
    doc.text("No employees to print.", PAGE_MARGIN_MM, PAGE_MARGIN_MM + 8);
    return new Uint8Array(doc.output("arraybuffer"));
  }

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    if (pageIndex > 0) doc.addPage();
    const pageCards = pages[pageIndex]!;

    for (let i = 0; i < pageCards.length; i++) {
      const card = pageCards[i]!;
      const col = i % BADGE_CARDS_PER_ROW;
      const row = Math.floor(i / BADGE_CARDS_PER_ROW);
      if (row >= BADGE_ROWS_PER_PAGE) break;

      const x = PAGE_MARGIN_MM + col * (BADGE_CARD_WIDTH_MM + GAP_X_MM);
      const y = PAGE_MARGIN_MM + row * (BADGE_CARD_HEIGHT_MM + GAP_Y_MM);

      const drawn = [];
      for (const side of card.sides) {
        let dataUrl = qrCache.get(side.payload);
        if (!dataUrl) {
          dataUrl = await fetchQrDataUrl(side.payload);
          qrCache.set(side.payload, dataUrl);
        }
        drawn.push({ ...side, dataUrl });
      }

      drawBadgeCard(
        doc,
        card.employee,
        group,
        drawn,
        x,
        y,
        printedLabel,
        card.cardIndex,
        card.cardCount
      );
    }
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
