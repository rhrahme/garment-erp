import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatSupplierUnitPrice } from "@/lib/currency/format";
import {
  buildFabricLineArticleMap,
  formatLabelGarmentDescription,
  productionCodeFromSticker,
} from "@/lib/sales-orders/label-codes";
import { productionBrandNameForOrder } from "@/lib/sales-orders/production-brand";
import { qrImageUrl } from "@/lib/production/qr-labels";
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

async function fetchQrDataUrl(payload: string, size = 80): Promise<string> {
  const res = await fetch(qrImageUrl(payload, size));
  if (!res.ok) throw new Error("Failed to load QR code image.");
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buffer.toString("base64")}`;
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

  const stickerEntries = order.fabric_lines.flatMap((line, lineIndex) =>
    (line.label_stickers ?? []).map((sticker) => ({
      article: articleByLineId.get(line.id) ?? lineIndex + 1,
      code: sticker.code,
      fabric: line.fabric_number,
      garment: formatLabelGarmentDescription(line.garment_type, sticker.piece_name),
      qrPayload: productionCodeFromSticker(sticker.code, order.client_code),
    }))
  );

  if (stickerEntries.length > 0) {
    if (y > 680) {
      doc.addPage();
      y = margin;
    }

    const qrCache = new Map<string, string>();
    const qrFetchSize = 160;
    const qrDrawSize = 38;
    await Promise.all(
      [...new Set(stickerEntries.map((entry) => entry.qrPayload))].map(async (payload) => {
        qrCache.set(payload, await fetchQrDataUrl(payload, qrFetchSize));
      })
    );
    const qrImages = stickerEntries.map((entry) => qrCache.get(entry.qrPayload) ?? "");

    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text("Label sticker codes", margin, y);
    y += 16;
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text("Art. # matches fabric table — scan QR or use code on physical stickers", margin, y);
    y += 18;

    autoTable(doc, {
      startY: y,
      head: [["Art.", "QR", "Code", "Fabric", "Garment"]],
      body: stickerEntries.map((entry) => [
        String(entry.article),
        "",
        entry.code,
        entry.fabric,
        entry.garment,
      ]),
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
          "PNG",
          data.cell.x + (data.cell.width - qrDrawSize) / 2,
          data.cell.y + (data.cell.height - qrDrawSize) / 2,
          qrDrawSize,
          qrDrawSize
        );
      },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
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
