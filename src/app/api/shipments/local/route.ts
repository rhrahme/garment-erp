import { NextResponse } from "next/server";
import { requireFactoryOpsAccess } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/json-file-cache";
import { readSalesOrders } from "@/lib/data/sales-orders";
import {
  ensureFabricOrdersLoaded,
  getStoredFabricOrder,
  listStoredFabricOrders,
} from "@/lib/integrations/fabric-order-store";
import { createInboundShipmentFromAwb } from "@/lib/integrations/create-inbound-shipment";
import { enrichShipmentsWithDestinationCity } from "@/lib/integrations/shipment-destination";
import { enrichShipmentsWithSupplierName } from "@/lib/integrations/shipment-supplier";
import {
  ensureSupplierRepliesLoaded,
  listSupplierReplies,
} from "@/lib/integrations/supplier-reply-store";
import { ensureShipmentsLoaded, listStoredShipments } from "@/lib/integrations/shipment-store";

export async function GET() {
  const session = await requireFactoryOpsAccess();
  if (!session) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    await Promise.all([
      ensureShipmentsLoaded(),
      ensureFabricOrdersLoaded(),
      ensureDocumentsLoaded(["supplier_contacts", "sales_orders"]),
      ensureSupplierRepliesLoaded(),
    ]);
    const fabricOrders = listStoredFabricOrders();
    const replies = listSupplierReplies(5000);
    const salesOrders = readSalesOrders().orders;
    const withSupplier = enrichShipmentsWithSupplierName(
      listStoredShipments(),
      fabricOrders,
      replies
    );
    const shipments = enrichShipmentsWithDestinationCity(
      withSupplier,
      fabricOrders,
      salesOrders,
      replies
    );
    return NextResponse.json({ shipments });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load shipments.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireFactoryOpsAccess();
  if (!session) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      awb_number?: string;
      carrier?: string;
      purchase_order_id?: string | null;
      po_number?: string | null;
    };

    if (!body.awb_number?.trim()) {
      return NextResponse.json({ error: "awb_number is required." }, { status: 400 });
    }

    await Promise.all([ensureShipmentsLoaded(), ensureFabricOrdersLoaded()]);

    let purchase_order_id = body.purchase_order_id?.trim() ?? null;
    let po_number = body.po_number?.trim() ?? null;
    let supplier_id: string | null = null;

    if (purchase_order_id) {
      const po = getStoredFabricOrder(purchase_order_id);
      if (!po) {
        return NextResponse.json({ error: "Fabric PO not found." }, { status: 404 });
      }
      po_number = po.po_number;
      supplier_id = po.supplier_id;
    } else if (po_number) {
      const po = listStoredFabricOrders().find(
        (order) => order.po_number.toUpperCase() === po_number!.toUpperCase()
      );
      if (po) {
        purchase_order_id = po.id;
        supplier_id = po.supplier_id;
      }
    }

    const { shipment, created } = await createInboundShipmentFromAwb({
      awb_number: body.awb_number.trim(),
      carrier: body.carrier?.trim(),
      purchase_order_id,
      po_number,
      supplier_id,
    });

    return NextResponse.json(
      {
        ok: true,
        shipment,
        created,
        message: created ? "AWB added and tracking started." : "AWB already exists.",
      },
      { status: created ? 201 : 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add AWB.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
