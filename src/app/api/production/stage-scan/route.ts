import { NextResponse } from "next/server";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import { scanAtFabricReceivingStation, scanAtStation, type ScanStation } from "@/lib/production/stage-scan";

const STATIONS: ScanStation[] = [
  "receive",
  "wash",
  "soak",
  "iron",
  "cutting",
  "sewing",
  "garment_wash",
  "finishing",
];

export async function POST(request: Request) {
  try {
    await ensureFabricReceivingDocumentsLoaded();
    const body = (await request.json()) as { code?: string; station?: string; context?: string };
    const code = String(body.code ?? "").trim();
    const station = String(body.station ?? "").trim() as ScanStation;
    const context = String(body.context ?? "").trim();

    if (!code) {
      return NextResponse.json({ error: "Scan or enter a sticker code." }, { status: 400 });
    }
    if (!STATIONS.includes(station)) {
      return NextResponse.json(
        { error: `Invalid station — use one of: ${STATIONS.join(", ")}.` },
        { status: 400 }
      );
    }

    const result =
      context === "fabric-receiving"
        ? await scanAtFabricReceivingStation(code, station)
        : await scanAtStation(code, station);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed.";
    const status = message.includes("not recognized") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
