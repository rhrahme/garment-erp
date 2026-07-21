import { NextResponse } from "next/server";
import { notifyIntegration } from "@/lib/integrations";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { createFabricPosFromSalesOrder } from "@/lib/sales-orders/create-fabric-pos";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(_request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const result = await createFabricPosFromSalesOrder(id);

    await notifyIntegration("fabric_order.created", {
      sales_order_id: result.order.id,
      so_number: result.order.so_number,
      client_reference: result.order.client_reference,
      fabric_po_count: result.fabricOrders.length,
      fabric_po_ids: result.fabricOrders.map((po) => po.id),
      source: "api",
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Failed to create fabric POs (API):", error);
    const message = error instanceof Error ? error.message : "Failed to create fabric orders.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
