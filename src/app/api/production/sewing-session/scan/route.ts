import { NextResponse } from "next/server";
import { processSewingKioskScan } from "@/lib/production/sewing-session";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      raw?: string;
      code?: string;
      kiosk_id?: string;
      workstation_id?: string | null;
    };
    const raw = String(body.raw ?? body.code ?? "").trim();
    const kiosk_id = String(body.kiosk_id ?? "default").trim() || "default";

    if (!raw) {
      return NextResponse.json({ error: "Scan badge or A4 piece QR." }, { status: 400 });
    }

    const result = await processSewingKioskScan({
      raw,
      kiosk_id,
      workstation_id: body.workstation_id,
      source: "erp",
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sewing scan failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
