import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";
import {
  getFabricLineIdsForPrint,
  linesNeedingPrint,
  orderWithFabricLines,
} from "@/lib/sales-orders/fabric-lines";
import {
  applyOrderStickerBatch,
  buildAllPoPrintSheets,
  buildFabricCutLabelsForSalesOrder,
  buildLabelsForSalesOrder,
  buildMultiPieceLabelsForSalesOrder,
  buildPoPrintSheet,
  qrImageUrl,
} from "@/lib/production/qr-labels";
import type { SalesOrder } from "@/lib/types/sales-orders";

function printLineIds(order: SalesOrder) {
  return {
    a4: getFabricLineIdsForPrint(order, "a4"),
    prep_stickers: getFabricLineIdsForPrint(order, "prep_stickers"),
    prod_stickers: getFabricLineIdsForPrint(order, "prod_stickers"),
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await ensureDocumentsLoaded(["sales_orders"]);
    const order = await getSalesOrderByIdFresh(id);
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

    const unprintedIds = printLineIds(order);
    const prepLines = linesNeedingPrint(order.fabric_lines, "prep_stickers");
    const prodLines = linesNeedingPrint(order.fabric_lines, "prod_stickers");
    const prepOrder = orderWithFabricLines(order, prepLines);
    const prodOrder = orderWithFabricLines(order, prodLines);

    let sheets = buildAllPoPrintSheets(order, pos);
    if (poNumber) {
      const match = pos.find((po) => po.po_number === poNumber);
      sheets = match ? [buildPoPrintSheet(match, order)] : [];
    } else if (poId) {
      const match = pos.find((po) => po.id === poId);
      sheets = match ? [buildPoPrintSheet(match, order)] : [];
    }

    const pieceLabels = buildLabelsForSalesOrder(prodOrder, order);
    const fabricCutLabels = buildFabricCutLabelsForSalesOrder(prepOrder, order);
    const cuttingPieceLabels = buildMultiPieceLabelsForSalesOrder(prodOrder, order);
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
        unprinted_line_ids: unprintedIds,
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
      unprinted_line_ids: unprintedIds,
      po_sheets: sheets.map((poSheet) => {
        const fabricNumbers = new Set(poSheet.labels.map((label) => label.fabric_number));
        const filtered =
          sheet === "fabric-cuts"
            ? fabricCutLabels.filter((label) => fabricNumbers.has(label.fabric_number))
            : poSheet.labels.filter((label) =>
                prodLines.some((line) => line.fabric_number === label.fabric_number)
              );
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
