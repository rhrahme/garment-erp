import { jsPDF } from "jspdf";
import { qrImageFetchUrl } from "@/lib/production/qr-labels";
import {
  type FactoryWorkstation,
  productionLineLabel,
  workstationScanUrl,
} from "@/lib/production/factory-workstations";

async function fetchQrDataUrl(payload: string, size: number): Promise<string> {
  const res = await fetch(qrImageFetchUrl(payload, size));
  if (!res.ok) throw new Error("Failed to load QR code image.");
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

/** A4 landscape grid — 8 lines × 9 tables, one QR placard per cell. */
export async function generateWorkstationQrPdf(
  workstations: FactoryWorkstation[]
): Promise<Uint8Array> {
  const sorted = [...workstations].sort((a, b) => {
    if (a.line_number !== b.line_number) return a.line_number - b.line_number;
    return a.station_number - b.station_number;
  });

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const headerH = 12;
  const cols = 8;
  const rows = 9;
  const cellW = (pageW - margin * 2) / cols;
  const cellH = (pageH - margin * 2 - headerH) / rows;
  const qrSize = Math.min(cellW - 4, cellH - 10, 18);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Hagan production workstations — scan QR to open ERP", margin, margin + 4);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Place one placard on each sewing machine. PL1 nearest Receive.", margin, margin + 9);

  const qrCache = new Map<string, string>();

  for (const ws of sorted) {
    const col = ws.line_number - 1;
    const row = ws.station_number - 1;
    const x = margin + col * cellW;
    const y = margin + headerH + row * cellH;
    const payload = workstationScanUrl(ws.id);
    let qrDataUrl = qrCache.get(payload);
    if (!qrDataUrl) {
      qrDataUrl = await fetchQrDataUrl(payload, 200);
      qrCache.set(payload, qrDataUrl);
    }

    const qrX = x + (cellW - qrSize) / 2;
    const qrY = y + 1;
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(ws.id, x + cellW / 2, qrY + qrSize + 3, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.text(
      `${productionLineLabel(ws.line_number)} · M${ws.station_number}`,
      x + cellW / 2,
      qrY + qrSize + 6.5,
      { align: "center" }
    );
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
