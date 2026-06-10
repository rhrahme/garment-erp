import { NextResponse } from "next/server";
import { ensureShipmentsLoaded, listStoredShipments } from "@/lib/integrations/shipment-store";

export async function GET() {
  try {
    await ensureShipmentsLoaded();
    return NextResponse.json({ shipments: listStoredShipments() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load shipments.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
