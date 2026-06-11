import { NextResponse } from "next/server";
import { getSupplierByIdFromContacts } from "@/lib/data/supplier-contacts";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import {
  createStoredFabricOrder,
  ensureFabricOrdersLoaded,
  listStoredFabricOrders,
} from "@/lib/integrations/fabric-order-store";
import { notifyIntegration } from "@/lib/integrations";
import { getPurchaseOrders } from "@/lib/data/queries";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  await ensureFabricOrdersLoaded();
  const demoOrders = await getPurchaseOrders();
  const storedOrders = listStoredFabricOrders();
  const orders = [...storedOrders, ...demoOrders.filter((o) => o.supplier?.is_fabric_supplier)];

  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as {
      supplier_id?: string;
      client_reference?: string;
      lines?: Array<{
        fabric_number: string;
        quantity_ordered: number;
        client_reference?: string | null;
        unit_price?: number;
      }>;
    };

    const supplier_id = body.supplier_id?.trim();
    const client_reference = body.client_reference?.trim();
    const lines = body.lines ?? [];

    if (!supplier_id || !client_reference || lines.length === 0) {
      return NextResponse.json(
        { error: "supplier_id, client_reference, and lines are required." },
        { status: 400 }
      );
    }

    const supplier = await getSupplierByIdFromContacts(supplier_id);
    if (!supplier) {
      return NextResponse.json({ error: `Unknown supplier: ${supplier_id}` }, { status: 400 });
    }

    await ensureFabricOrdersLoaded();
    const order = createStoredFabricOrder({
      supplier_id,
      client_reference,
      lines,
      supplier,
    });

    await notifyIntegration("fabric_order.created", {
      id: order.id,
      po_number: order.po_number,
      supplier_id: order.supplier_id,
      supplier_name: supplier.name,
      client_reference: order.client_reference,
      line_count: order.lines?.length ?? 0,
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    console.error("Create fabric order failed:", error);
    return NextResponse.json({ error: "Failed to create fabric order." }, { status: 500 });
  }
}
