import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import sharp from "sharp";
import { formatSupplierUnitPrice } from "@/lib/currency/format";
import {
  buildFabricLineArticleMap,
  formatLabelGarmentDescription,
  productionCodeFromSticker,
  supplierFabricProductionCode,
} from "@/lib/sales-orders/label-codes";
import { productionBrandNameForOrder } from "@/lib/sales-orders/production-brand";
import { qrImageFetchUrl } from "@/lib/production/qr-labels";
import {
  fabricSupplierGroupKey,
  formatFabricSupplierName,
} from "@/lib/fabric-sourcing/supplier-display";
import { getDeliveryDestination } from "@/lib/shipping/delivery-destinations";
import { formatSalesOrderLineStock, orderLineHasStockAlert } from "@/lib/fabric-sourcing/fabric-stock";
import { formatTotalFabricWeightKg } from "@/lib/sales-orders/fabric-weight";
import { formatDate } from "@/lib/utils";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

function formatWidth(line: SalesOrderFabricLine): string {
  if (line.width_cm != null) return `${line.width_cm} cm`;
  if (line.width_inches != null) return `${line.width_inches}"`;
  return "—";
}

function formatLinePrice(line: SalesOrderFabricLine): string {
  if (!line.unit_price) return "—";
  return formatSupplierUnitPrice(line.unit_price, line.supplier_id, line.unit);
}

function groupLinesBySupplier(lines: SalesOrderFabricLine[]) {
  return lines.reduce<Record<string, { name: string; lines: SalesOrderFabricLine[] }>>((acc, line) => {
    const key = fabricSupplierGroupKey(line.supplier_id, line.fabric_number);
    const name = formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number);
    const bucket = acc[key] ?? { name, lines: [] };
    bucket.lines.push(line);
    acc[key] = bucket;
    return acc;
  }, {});
}

/** JPEG embed — jsPDF Indexed 1-bit PNG from qrserver renders blank in most PDF viewers. */
async function fetchQrJpegDataUrl(payload: string, size = 80): Promise<string> {
  const res = await fetch(qrImageFetchUrl(payload, size));
  if (!res.ok) throw new Error("Failed to load QR code image.");
  const png = Buffer.from(await res.arrayBuffer());
  const jpeg = await sharp(png).jpeg({ quality: 95, mozjpeg: true }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

type QrTableRow = {
  article: number;
  qrPayload: string;
  cells: string[];
};

async function loadQrImages(rows: QrTableRow[], qrFetchSize: number): Promise<string[]> {
  const qrCache = new Map<string, string>();
  await Promise.all(
    [...new Set(rows.map((row) => row.qrPayload))].map(async (payload) => {
      qrCache.set(payload, await fetchQrJpegDataUrl(payload, qrFetchSize));
    })
  );
  return rows.map((row) => qrCache.get(row.qrPayload) ?? "");
}

function renderQrTable(
  doc: jsPDF,
  margin: number,
  startY: number,
  title: string,
  subtitle: string,
  head: string[],
  rows: QrTableRow[],
  qrImages: string[],
  qrDrawSize: number
): number {
  let y = startY;
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(title, margin, y);
  y += 16;
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(subtitle, margin, y);
  y += 18;

  autoTable(doc, {
    startY: y,
    head: [head],
    body: rows.map((row) => [String(row.article), "", ...row.cells]),
    margin: { left: margin, right: margin },
    styles: { fontSize: 7, cellPadding: 6, minCellHeight: 48, valign: "middle" },
    headStyles: { fillColor: [71, 85, 105], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 22, halign: "center" },
      1: { cellWidth: 46, halign: "center" },
    },
    theme: "grid",
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 1) return;
      const img = qrImages[data.row.index];
      if (!img) return;
      doc.addImage(
        img,
        "JPEG",
        data.cell.x + (data.cell.width - qrDrawSize) / 2,
        data.cell.y + (data.cell.height - qrDrawSize) / 2,
        qrDrawSize,
        qrDrawSize
      );
    },
  });

  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
}

export async function generateSalesOrderPdf(
  order: SalesOrder,
  options: { showPrices?: boolean } = {}
): Promise<Uint8Array> {
  const showPrices = options.showPrices !== false;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  let y = margin;
  const articleByLineId = buildFabricLineArticleMap(order.fabric_lines.map((line) => line.id));
  const productionBrand = productionBrandNameForOrder(order);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("SALES ORDER", margin, y);
  y += 18;

  doc.setFontSize(20);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text(order.so_number, margin, y);
  doc.setFont("helvetica", "normal");
  y += 24;

  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.text(productionBrand.toUpperCase(), margin, y);
  doc.setFont("helvetica", "normal");
  y += 18;

  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text("Production brand — follow this brand's stitching specification", margin, y);
  y += 16;

  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.text(`Order date: ${formatDate(order.order_date)}`, margin, y);
  if (order.delivery_date) {
    doc.text(`Delivery: ${formatDate(order.delivery_date)}`, margin + 200, y);
  }
  y += 16;

  const shipLabel =
    getDeliveryDestination(order.delivery_destination)?.label ?? order.delivery_destination ?? "Not set";

  doc.text(`Client: ${order.client_name} (${order.client_code})`, margin, y);
  y += 14;
  if (order.product_article) {
    doc.text(`Batch / article name: ${order.product_article}`, margin, y);
    y += 14;
  }
  if (order.client_reference) {
    doc.text(`Client reference: ${order.client_reference}`, margin, y);
    y += 14;
  }
  doc.text(`Ship fabrics to: ${shipLabel}`, margin, y);
  y += 14;
  doc.text(`Status: ${order.status.replace(/_/g, " ")}`, margin, y);
  y += 20;

  const supplierGroups = groupLinesBySupplier(order.fabric_lines);
  const totalMeters = order.fabric_lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalWeightLabel = formatTotalFabricWeightKg(order.fabric_lines);
  const showStock = order.fabric_lines.some(orderLineHasStockAlert);
  doc.text(
    `${order.fabric_lines.length} fabric line${order.fabric_lines.length !== 1 ? "s" : ""} · ${totalMeters.toFixed(1)} m total${totalWeightLabel ? ` · ${totalWeightLabel}` : ""}`,
    margin,
    y
  );
  y += 16;

  const fabricHead = ["Art.", "Fabric", "Garment", "Labels", "Composition", "Weight", "Width", "Qty"];
  if (showStock) fabricHead.push("Stock");
  if (showPrices) fabricHead.push("Price");

  for (const group of Object.values(supplierGroups)) {
    if (y > 720) {
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(11);
    doc.setTextColor(40);
    doc.text(group.name, margin, y);
    y += 8;

    const body = group.lines.map((line) => {
      const row = [
        String(articleByLineId.get(line.id) ?? "—"),
        line.fabric_number,
        line.garment_type,
        String(line.label_count),
        line.composition ?? "—",
        line.weight_gsm != null ? `${line.weight_gsm} gsm` : "—",
        formatWidth(line),
        `${line.quantity} ${line.unit === "meters" ? "m" : line.unit}`,
      ];
      if (showStock) row.push(formatSalesOrderLineStock(line) ?? "—");
      if (showPrices) row.push(formatLinePrice(line));
      return row;
    });

    autoTable(doc, {
      startY: y,
      head: [fabricHead],
      body,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [71, 85, 105], textColor: 255 },
      columnStyles: { 0: { cellWidth: 24, halign: "center" } },
      theme: "grid",
    });

    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  }

  const qrFetchSize = 160;
  const qrDrawSize = 38;

  const fabricCutRows: QrTableRow[] = order.fabric_lines.map((line, lineIndex) => {
    const article = articleByLineId.get(line.id) ?? lineIndex + 1;
    const stickers = line.label_stickers ?? [];
    const firstCode =
      stickers[0]?.code ??
      `${order.client_reference ?? order.so_number}-L${String(article).padStart(2, "0")}`;
    const fabricCutCode = supplierFabricProductionCode(firstCode, order.client_code);
    return {
      article,
      qrPayload: fabricCutCode,
      cells: [fabricCutCode, line.fabric_number, line.garment_type, `${line.quantity} m`],
    };
  });

  if (fabricCutRows.length > 0) {
    if (y > 680) {
      doc.addPage();
      y = margin;
    }
    const fabricCutQrImages = await loadQrImages(fabricCutRows, qrFetchSize);
    y = renderQrTable(
      doc,
      margin,
      y,
      "Fabric cut QR — receive / wash",
      "One QR per fabric line — scan when fabric arrives (before jacket / trouser split)",
      ["Art.", "QR", "Fabric cut", "Fabric", "Garment", "Meters"],
      fabricCutRows,
      fabricCutQrImages,
      qrDrawSize
    );
  }

  const stickerRows: QrTableRow[] = order.fabric_lines.flatMap((line, lineIndex) =>
    (line.label_stickers ?? []).map((sticker) => ({
      article: articleByLineId.get(line.id) ?? lineIndex + 1,
      qrPayload: productionCodeFromSticker(sticker.code, order.client_code),
      cells: [
        sticker.code,
        line.fabric_number,
        formatLabelGarmentDescription(line.garment_type, sticker.piece_name),
      ],
    }))
  );

  if (stickerRows.length > 0) {
    if (y > 680) {
      doc.addPage();
      y = margin;
    }
    const stickerQrImages = await loadQrImages(stickerRows, qrFetchSize);
    y = renderQrTable(
      doc,
      margin,
      y,
      "Label sticker codes",
      "Art. # matches fabric table — scan QR or use code on physical stickers",
      ["Art.", "QR", "Code", "Fabric", "Garment"],
      stickerRows,
      stickerQrImages,
      qrDrawSize
    );
  }

  if (order.notes?.trim()) {
    if (y > 740) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(10);
    doc.setTextColor(40);
    doc.text("Notes", margin, y);
    y += 12;
    doc.setFontSize(9);
    doc.setTextColor(60);
    const noteLines = doc.splitTextToSize(order.notes.trim(), 515);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 11 + 8;
  }

  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Generated ${new Date().toLocaleString()} · Garment Factory`, margin, 820);

  return new Uint8Array(doc.output("arraybuffer"));
}
