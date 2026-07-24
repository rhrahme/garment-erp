import { NextResponse } from "next/server";
import { notifyIntegration } from "@/lib/integrations";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { transferFabricLine } from "@/lib/sales-orders/transfer-fabric";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const { id: sourceOrderId } = await context.params;
    const body = (await request.json()) as {
      source_line_id?: string;
      destination_sales_order_id?: string;
      meters?: number;
      reason?: string;
      transferred_by?: string;
      acknowledge_receiving_stage?: boolean;
      admin_override?: boolean;
      /** When true with admin_override, treated as Admin (Zapier automations). */
      as_admin?: boolean;
    };

    const result = await transferFabricLine(
      {
        source_sales_order_id: sourceOrderId,
        source_line_id: body.source_line_id ?? "",
        destination_sales_order_id: body.destination_sales_order_id ?? "",
        meters: Number(body.meters),
        reason: body.reason ?? "",
        acknowledge_receiving_stage: Boolean(body.acknowledge_receiving_stage),
        admin_override: Boolean(body.admin_override),
      },
      {
        transferredBy: body.transferred_by?.trim() || "zapier",
        isAdmin: Boolean(body.admin_override) && body.as_admin !== false,
      }
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await notifyIntegration(
      "fabric.transferred",
      {
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
        source_stage: result.result.transfer.source_stage ?? null,
        acknowledged_receiving_stage: Boolean(result.result.transfer.acknowledged_receiving_stage),
        admin_override: Boolean(result.result.transfer.admin_override),
        cancelled_production_work_order_ids:
          result.result.transfer.cancelled_production_work_order_ids ?? [],
      },
      "zapier"
    );

    if (result.result.replacement_fabric_orders.length > 0) {
      await notifyIntegration(
        "fabric_order.created",
        {
          sales_order_id: result.result.source_order.id,
          so_number: result.result.source_order.so_number,
          client_reference: result.result.source_order.client_reference,
          fabric_po_count: result.result.replacement_fabric_orders.length,
          fabric_po_ids: result.result.replacement_fabric_orders.map((po) => po.id),
          source: "fabric_transfer",
        },
        "zapier"
      );
    }

    return NextResponse.json(result.result, { status: 201 });
  } catch (error) {
    console.error("Failed to transfer fabric (API):", error);
    const message = error instanceof Error ? error.message : "Failed to transfer fabric.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
