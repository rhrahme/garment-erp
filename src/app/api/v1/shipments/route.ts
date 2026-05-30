import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { createShipment, listStoredShipments } from "@/lib/integrations/shipment-store";
import { notifyIntegration } from "@/lib/integrations";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

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

    const shipment = createShipment({
      awb_number: body.awb_number.trim(),
      carrier: body.carrier?.trim() || "DHL",
      purchase_order_id: body.purchase_order_id?.trim() ?? null,
      po_number: body.po_number?.trim() ?? null,
      status: body.status?.trim() || "in_transit",
      direction: body.direction ?? "inbound",
      estimated_arrival: body.estimated_arrival ?? null,
    });

    await notifyIntegration("awb.received", {
      id: shipment.id,
      awb_number: shipment.awb_number,
      carrier: shipment.carrier,
      po_number: shipment.po_number,
      purchase_order_id: shipment.purchase_order_id,
      status: shipment.status,
      estimated_arrival: shipment.estimated_arrival,
    }, "zapier");

    return NextResponse.json({ ok: true, shipment }, { status: 201 });
  } catch (error) {
    console.error("Create shipment failed:", error);
    return NextResponse.json({ error: "Failed to create shipment." }, { status: 500 });
  }
}
