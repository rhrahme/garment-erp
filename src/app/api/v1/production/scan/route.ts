import { NextResponse } from "next/server";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import { verifyApiKey } from "@/lib/integrations";
import { executeStageScan } from "@/lib/production/execute-stage-scan";
import type { ScanStation } from "@/lib/production/stage-scan";

const STATIONS = [
  "receive",
  "wash",
  "soak",
  "iron",
  "cutting",
  "sewing",
  "garment_wash",
  "finishing",
  "packed",
] as const satisfies readonly ScanStation[];

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensureFabricReceivingDocumentsLoaded();
    const body = (await request.json()) as {
      code?: string;
      station?: string;
      context?: string;
      employee_id?: string;
      workstation_id?: string | null;
    };

    const code = String(body.code ?? "").trim();
    const station = String(body.station ?? "").trim() as ScanStation;
    const context = String(body.context ?? "production").trim();

    if (!code) {
      return NextResponse.json({ error: "code is required." }, { status: 400 });
    }
    if (!STATIONS.includes(station as (typeof STATIONS)[number])) {
      return NextResponse.json({ error: `Invalid station — use one of: ${STATIONS.join(", ")}.` }, { status: 400 });
    }
    if (!body.employee_id?.trim()) {
      return NextResponse.json({ error: "employee_id is required." }, { status: 400 });
    }

    const result = await executeStageScan({
      code,
      station,
      context: context === "fabric-receiving" ? "fabric-receiving" : "production",
      employee_id: body.employee_id,
      workstation_id: body.workstation_id,
      require_employee: true,
      source: "api",
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed.";
    const status = message.includes("not found") || message.includes("not recognized") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
