import { NextResponse } from "next/server";
import { normalizeAwbScanInput } from "@/lib/integrations/normalize-awb-scan";
import { ensureShipmentsLoaded, getShipmentByAwb } from "@/lib/integrations/shipment-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { awb_number?: string; scan_input?: string };
    const raw = body.scan_input?.trim() || body.awb_number?.trim() || "";
    if (!raw) {
      return NextResponse.json({ error: "AWB number or scan input is required." }, { status: 400 });
    }

    const awb_number = normalizeAwbScanInput(raw);
    if (!awb_number) {
      return NextResponse.json(
        {
          error:
            "Could not read an AWB from that scan. Scan a carrier label or type the tracking number.",
        },
        { status: 400 }
      );
    }

    await ensureShipmentsLoaded();
    const shipment = getShipmentByAwb(awb_number) ?? null;

    return NextResponse.json({
      ok: true,
      awb_number,
      found: Boolean(shipment),
      shipment,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to look up AWB.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
