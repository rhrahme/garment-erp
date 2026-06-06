import { NextResponse } from "next/server";
import { getSalesOrderById } from "@/lib/data/sales-orders";
import { listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";
import {
  applyOrderStickerBatch,
  buildAllPoPrintSheets,
  buildFabricCutLabelsForSalesOrder,
  buildLabelsForSalesOrder,
  buildMultiPieceLabelsForSalesOrder,
  buildPoPrintSheet,
  qrImageUrl,
} from "@/lib/production/qr-labels";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const order = getSalesOrderById(id);
    if (!order) {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }

    const url = new URL(request.url);
    const poNumber = url.searchParams.get("po")?.trim();
    const poId = url.searchParams.get("po_id")?.trim();
    const sheetParam = url.searchParams.get("sheet");
    const sheet =
      sheetParam === "fabric-cuts"
        ? "fabric-cuts"
        : sheetParam === "print-pack"
          ? "print-pack"
          : "pieces";

    const pos = listStoredFabricOrders().filter(
      (po) => po.sales_order_id === order.id || po.client_reference?.includes(order.so_number)
    );

    let sheets = buildAllPoPrintSheets(order, pos);
    if (poNumber) {
      const match = pos.find((po) => po.po_number === poNumber);
      sheets = match ? [buildPoPrintSheet(match, order)] : [];
    } else if (poId) {
      const match = pos.find((po) => po.id === poId);
      sheets = match ? [buildPoPrintSheet(match, order)] : [];
    }

    const pieceLabels = buildLabelsForSalesOrder(order);
    const fabricCutLabels = buildFabricCutLabelsForSalesOrder(order);
    const cuttingPieceLabels = buildMultiPieceLabelsForSalesOrder(order);
    const activeLabels =
      sheet === "fabric-cuts" ? fabricCutLabels : sheet === "print-pack" ? fabricCutLabels : pieceLabels;

    const mapLabels = (labels: ReturnType<typeof buildLabelsForSalesOrder>) =>
      applyOrderStickerBatch(labels, order).map((label) => ({
        ...label,
        qr_url: qrImageUrl(label.qr_payload, 120),
      }));

    if (sheet === "print-pack") {
      return NextResponse.json({
        sheet,
        order: {
          id: order.id,
          so_number: order.so_number,
          client_code: order.client_code,
          client_name: order.client_name,
        },
        fabric_cut_labels: mapLabels(fabricCutLabels),
        cutting_piece_labels: mapLabels(cuttingPieceLabels),
        has_cutting_pack: cuttingPieceLabels.length > 0,
      });
    }

    return NextResponse.json({
      sheet,
      order: {
        id: order.id,
        so_number: order.so_number,
        client_code: order.client_code,
        client_name: order.client_name,
      },
      labels: mapLabels(activeLabels),
      po_sheets: sheets.map((poSheet) => {
        const fabricNumbers = new Set(poSheet.labels.map((label) => label.fabric_number));
        const filtered =
          sheet === "fabric-cuts"
            ? fabricCutLabels.filter((label) => fabricNumbers.has(label.fabric_number))
            : poSheet.labels;
        return {
          ...poSheet,
          labels: mapLabels(filtered),
        };
      }),
    });
  } catch (error) {
    console.error("Failed to build sticker labels:", error);
    return NextResponse.json({ error: "Failed to load sticker labels." }, { status: 500 });
  }
}
