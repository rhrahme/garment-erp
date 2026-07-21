import { NextResponse } from "next/server";
import {
  redactSalesOrderFabricPrices,
} from "@/lib/auth/fabric-price-access";
import { resolveFabricPriceAccess } from "@/lib/auth/fabric-price-access.server";
import { requireAuthenticated } from "@/lib/auth/session";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { notifyIntegration } from "@/lib/integrations";
import { canAccessSalesOrder } from "@/lib/sales/access";
import {
  canTransferFabric,
  transferFabricLine,
} from "@/lib/sales-orders/transfer-fabric";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!canTransferFabric(session)) {
      return NextResponse.json(
        { error: "Only Admin and QC can transfer fabric between clients." },
        { status: 403 }
      );
    }

    const { id: sourceOrderId } = await context.params;
    const sourceOrder = await getSalesOrderByIdFresh(sourceOrderId);
    if (!sourceOrder || !canAccessSalesOrder(session, sourceOrder)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await request.json()) as {
      source_line_id?: string;
      destination_sales_order_id?: string;
      meters?: number;
      reason?: string;
    };

    const result = await transferFabricLine(
      {
        source_sales_order_id: sourceOrderId,
        source_line_id: body.source_line_id ?? "",
        destination_sales_order_id: body.destination_sales_order_id ?? "",
        meters: Number(body.meters),
        reason: body.reason ?? "",
      },
      { transferredBy: session.email ?? "unknown" }
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await notifyIntegration("fabric.transferred", {
      transfer_id: result.result.transfer.id,
      meters: result.result.transfer.meters,
      is_partial: result.result.transfer.is_partial,
      reason: result.result.transfer.reason,
      transferred_by: result.result.transfer.transferred_by,
      source: result.result.transfer.source,
      destination: result.result.transfer.destination,
      replacement_line_id: result.result.transfer.replacement.line_id,
      replacement_fabric_po_ids: result.result.transfer.replacement_fabric_po_ids,
      print_stickers_href: result.result.print_stickers_href,
    });

    if (result.result.replacement_fabric_orders.length > 0) {
      await notifyIntegration("fabric_order.created", {
        sales_order_id: result.result.source_order.id,
        so_number: result.result.source_order.so_number,
        client_reference: result.result.source_order.client_reference,
        fabric_po_count: result.result.replacement_fabric_orders.length,
        fabric_po_ids: result.result.replacement_fabric_orders.map((po) => po.id),
        source: "fabric_transfer",
      });
    }

    const canViewFabricPrices = await resolveFabricPriceAccess(session);
    const safeSource = canViewFabricPrices
      ? result.result.source_order
      : redactSalesOrderFabricPrices(result.result.source_order);
    const safeDest = canViewFabricPrices
      ? result.result.destination_order
      : redactSalesOrderFabricPrices(result.result.destination_order);

    return NextResponse.json({
      transfer: result.result.transfer,
      source_order: safeSource,
      destination_order: safeDest,
      destination_line_id: result.result.destination_line.id,
      replacement_line_id: result.result.replacement_line.id,
      replacement_fabric_po_ids: result.result.transfer.replacement_fabric_po_ids,
      print_stickers_href: result.result.print_stickers_href,
      /** Admin should email suppliers for A's replacement POs. */
      admin_alert: {
        type: "needs_supplier_email",
        message: `Transfer replacement on ${result.result.source_order.so_number} needs supplier email.`,
        sales_order_id: result.result.source_order.id,
        so_number: result.result.source_order.so_number,
      },
    });
  } catch (error) {
    console.error("Failed to transfer fabric:", error);
    const message = error instanceof Error ? error.message : "Failed to transfer fabric.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
