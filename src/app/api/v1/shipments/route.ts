import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { createInboundShipmentFromAwb } from "@/lib/integrations/create-inbound-shipment";
import { ensureShipmentsLoaded, listStoredShipments } from "@/lib/integrations/shipment-store";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  await ensureShipmentsLoaded();
  return NextResponse.json({ shipments: listStoredShipments() });
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as {
      awb_number?: string;
      carrier?: string;
      purchase_order_id?: string | null;
      po_number?: string | null;
      status?: string;
      direction?: "inbound" | "outbound";
      estimated_arrival?: string | null;
    };

    if (!body.awb_number?.trim()) {
      return NextResponse.json({ error: "awb_number is required." }, { status: 400 });
    }

    await ensureShipmentsLoaded();
    const { shipment, created } = await createInboundShipmentFromAwb({
      awb_number: body.awb_number.trim(),
      carrier: body.carrier?.trim(),
      purchase_order_id: body.purchase_order_id?.trim() ?? null,
      po_number: body.po_number?.trim() ?? null,
    });

    return NextResponse.json({ ok: true, shipment, created }, { status: created ? 201 : 200 });
  } catch (error) {
    console.error("Create shipment failed:", error);
    return NextResponse.json({ error: "Failed to create shipment." }, { status: 500 });
  }
}
