import { jsPDF } from "jspdf";
import {
  BADGE_CARD_HEIGHT_MM,
  BADGE_CARD_WIDTH_MM,
  BADGE_CARDS_PER_PAGE,
  BADGE_CARDS_PER_ROW,
  BADGE_ROWS_PER_PAGE,
  badgeDisplayName,
  badgeJobFunctionsLine,
  badgePrintDateLabel,
  chunkBadgePages,
} from "@/lib/hr/badge-print";
import { employeeAlterationQrPayload, employeeQrPayload } from "@/lib/hr/employee-qr";
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
/**
 * Sew QR on the left edge, Alteration on the right edge.
 * Minimum clear gap between codes = 30mm (3cm) so the USB wedge cannot grab both.
 */
const QR_DISPLAY_MM = 14;
const QR_FETCH_PX = 160;
const QR_GAP_MM = 30;
const QR_SIDE_PAD_MM = 1.5;
const CROP_ARM_MM = 2.5;
const CROP_THICK_MM = 0.25;
const CROP_GAP_MM = 0.5;

async function fetchQrDataUrl(payload: string): Promise<string> {
  const res = await fetch(qrImageFetchUrl(payload, QR_FETCH_PX));
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
  qrDataUrl: string,
  altQrDataUrl: string,
  x: number,
  y: number,
  printedLabel: string
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

  // Sew left / Alt right - forces >= 30mm clear gap across the middle (name + ID).
  const sewX = x + QR_SIDE_PAD_MM;
  const altX = x + w - QR_SIDE_PAD_MM - QR_DISPLAY_MM;
  const clearGap = altX - (sewX + QR_DISPLAY_MM);
  if (clearGap < QR_GAP_MM) {
    throw new Error(
      `Badge QR gap ${clearGap.toFixed(1)}mm is under the required ${QR_GAP_MM}mm.`
    );
  }

  const qrY = bodyY + Math.max(2, (bodyH - QR_DISPLAY_MM - 4) / 2);

  // Soft side panels behind each QR
  doc.setFillColor(248, 250, 252);
  doc.rect(x, bodyY, QR_DISPLAY_MM + QR_SIDE_PAD_MM * 2, bodyH, "F");
  doc.rect(
    x + w - (QR_DISPLAY_MM + QR_SIDE_PAD_MM * 2),
    bodyY,
    QR_DISPLAY_MM + QR_SIDE_PAD_MM * 2,
    bodyH,
    "F"
  );

  doc.addImage(qrDataUrl, "PNG", sewX, qrY, QR_DISPLAY_MM, QR_DISPLAY_MM);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.rect(sewX, qrY, QR_DISPLAY_MM, QR_DISPLAY_MM);
  doc.setTextColor(71, 85, 105);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.text("SEW", sewX + QR_DISPLAY_MM / 2, qrY + QR_DISPLAY_MM + 2.2, {
    align: "center",
  });

  doc.addImage(altQrDataUrl, "PNG", altX, qrY, QR_DISPLAY_MM, QR_DISPLAY_MM);
  doc.setDrawColor(180, 83, 9);
  doc.setLineWidth(0.4);
  doc.rect(altX, qrY, QR_DISPLAY_MM, QR_DISPLAY_MM);
  doc.setTextColor(146, 64, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.text("ALT", altX + QR_DISPLAY_MM / 2, qrY + QR_DISPLAY_MM + 2.2, {
    align: "center",
  });
  doc.setLineWidth(0.2);

  // Center text column between the two QRs
  const textX = sewX + QR_DISPLAY_MM + 2.5;
  const textMaxW = clearGap - 5;
  let textY = bodyY + 4;

  if (group === "saudi") {
    doc.setTextColor(BADGE_NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("SAUDI", textX, textY);
    textY += 4;
  }

  const jobsLine = badgeJobFunctionsLine(employee);
  const nameMaxLines = jobsLine ? 2 : 3;

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const nameLines = doc.splitTextToSize(badgeDisplayName(employee), textMaxW);
  doc.text(nameLines.slice(0, nameMaxLines), textX, textY);
  textY += Math.min(nameLines.length, nameMaxLines) * 4.2;

  if (jobsLine) {
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    const jobLines = doc.splitTextToSize(jobsLine, textMaxW);
    doc.text(jobLines.slice(0, 2), textX, textY + 0.8);
  }

  // Footer reserved inside cut edge: ID + always-visible print date
  const printY = y + h - 3.5;
  const idY = printY - 4.2;
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.text("EMPLOYEE ID", textX, idY - 3.5);
  doc.setTextColor(11, 44, 90);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(employee.employee_id_number, textX, idY, {
    maxWidth: textMaxW,
  });

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text(printedLabel, textX, printY, {
    maxWidth: textMaxW,
  });
}

/**
 * A4 portrait PDF - 2x5 CR80 badge cards with crop marks (matches print sheet).
 */
export async function generateEmployeeBadgePdf(
  employees: PayrollEmployee[],
  group: IdBadgeGroup
): Promise<Uint8Array> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pages = chunkBadgePages(employees, BADGE_CARDS_PER_PAGE);
  const qrCache = new Map<string, string>();
  const printedLabel = badgePrintDateLabel();

  if (pages.length === 0) {
    doc.setFontSize(12);
    doc.text("No employees to print.", PAGE_MARGIN_MM, PAGE_MARGIN_MM + 8);
    return new Uint8Array(doc.output("arraybuffer"));
  }

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    if (pageIndex > 0) doc.addPage();
    const pageEmployees = pages[pageIndex]!;

    for (let i = 0; i < pageEmployees.length; i++) {
      const employee = pageEmployees[i]!;
      const col = i % BADGE_CARDS_PER_ROW;
      const row = Math.floor(i / BADGE_CARDS_PER_ROW);
      if (row >= BADGE_ROWS_PER_PAGE) break;

      const x = PAGE_MARGIN_MM + col * (BADGE_CARD_WIDTH_MM + GAP_X_MM);
      const y = PAGE_MARGIN_MM + row * (BADGE_CARD_HEIGHT_MM + GAP_Y_MM);

      const payload = employeeQrPayload(employee);
      const altPayload = employeeAlterationQrPayload(employee);
      let qrDataUrl = qrCache.get(payload);
      if (!qrDataUrl) {
        qrDataUrl = await fetchQrDataUrl(payload);
        qrCache.set(payload, qrDataUrl);
      }
      let altQrDataUrl = qrCache.get(altPayload);
      if (!altQrDataUrl) {
        altQrDataUrl = await fetchQrDataUrl(altPayload);
        qrCache.set(altPayload, altQrDataUrl);
      }

      drawBadgeCard(doc, employee, group, qrDataUrl, altQrDataUrl, x, y, printedLabel);
    }
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
