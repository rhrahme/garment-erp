import { NextResponse } from "next/server";
import { ensurePatternDocumentsLoaded } from "@/lib/data/pattern-jobs";
import { verifyApiKey } from "@/lib/integrations";
import { executeStageScan } from "@/lib/production/execute-stage-scan";
import {
  isPatternScanStation,
  PATTERN_SCAN_STATIONS,
} from "@/lib/pattern/pattern-stage-scan";
import type { ScanStation } from "@/lib/production/stage-scan";

export const dynamic = "force-dynamic";

/**
 * Zapier / API parity: Pattern operator scans a manufacturing QR
 * (same payload as production stickers / A4 size sheet) at a Pattern station.
 */
export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternDocumentsLoaded();
    const body = (await request.json()) as {
      code?: string;
      station?: string;
      employee_id?: string;
      workstation_id?: string | null;
    };

    const code = String(body.code ?? "").trim();
    const station = String(body.station ?? "").trim() as ScanStation;

    if (!code) {
      return NextResponse.json({ error: "code is required." }, { status: 400 });
    }
    if (!isPatternScanStation(station)) {
      return NextResponse.json(
        { error: `Invalid station - use one of: ${PATTERN_SCAN_STATIONS.join(", ")}.` },
        { status: 400 }
      );
    }
    if (!body.employee_id?.trim()) {
      return NextResponse.json({ error: "employee_id is required." }, { status: 400 });
    }

    const result = await executeStageScan({
      code,
      station,
      context: "pattern",
      employee_id: body.employee_id,
      workstation_id: body.workstation_id,
      require_employee: true,
      source: "api",
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed.";
    const status =
      message.includes("not found") || message.includes("not recognized") || message.includes("No pattern job")
        ? 404
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
