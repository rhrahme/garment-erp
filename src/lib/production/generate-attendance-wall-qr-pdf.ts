import { jsPDF } from "jspdf";
import { ATTENDANCE_WALL_QR_PAYLOAD } from "@/lib/production/stitch-attendance";
import { qrImageFetchUrl } from "@/lib/production/qr-labels";

async function fetchQrDataUrl(payload: string, size: number): Promise<string> {
  const res = await fetch(qrImageFetchUrl(payload, size));
  if (!res.ok) throw new Error("Failed to load attendance QR image.");
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

/** One A4 landscape wall placard. Hang today; clock-in counts from 8 Sep 2026 Riyadh. */
export async function generateAttendanceWallQrPdf(): Promise<Uint8Array> {
  const qrDataUrl = await fetchQrDataUrl(ATTENDANCE_WALL_QR_PAYLOAD, 600);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const qrSize = 118;
  const qrX = (pageW - qrSize) / 2;
  const qrY = 28;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text("ATTENDANCE", pageW / 2, 16, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("Hajira - sign in at the stitch kiosk", pageW / 2, 23, { align: "center" });

  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(ATTENDANCE_WALL_QR_PAYLOAD, pageW / 2, qrY + qrSize + 8, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  const stepsY = qrY + qrSize + 18;
  doc.text("ENGLISH", 16, stepsY);
  doc.text("1. Scan your personal ID badge.", 16, stepsY + 7);
  doc.text("2. Scan this wall QR.", 16, stepsY + 13);
  doc.text("Attendance only. Does not start a piece.", 16, stepsY + 19);
  doc.text("When you stitch: badge again, then A4.", 16, stepsY + 25);

  doc.text("BANGLA", pageW / 2 + 8, stepsY);
  doc.text("1. Nijer ID badge scan korun.", pageW / 2 + 8, stepsY + 7);
  doc.text("2. Ei wall QR scan korun.", pageW / 2 + 8, stepsY + 13);
  doc.text("Eita attendance only. Piece start na.", pageW / 2 + 8, stepsY + 19);
  doc.text("Stitching: pore abar badge + A4.", pageW / 2 + 8, stepsY + 25);

  doc.setFontSize(10);
  doc.text(
    "Clock-in starts 8 Sep 2026 (Riyadh). Hang at the entrance. This QR never starts or stops garment work.",
    pageW / 2,
    pageH - 8,
    { align: "center" }
  );

  return doc.output("arraybuffer") as Uint8Array;
}
