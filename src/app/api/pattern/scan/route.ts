import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternDocumentsLoaded } from "@/lib/data/pattern-jobs";
import { executeStageScan } from "@/lib/production/execute-stage-scan";
import {
  isPatternScanStation,
  PATTERN_SCAN_STATIONS,
} from "@/lib/pattern/pattern-stage-scan";
import type { ScanStation } from "@/lib/production/stage-scan";
import type { ScanEmployeeContext } from "@/lib/types/production-scan";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }

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
      return NextResponse.json({ error: "Scan or enter a manufacturing QR code." }, { status: 400 });
    }
    if (!isPatternScanStation(station)) {
      return NextResponse.json(
        { error: `Invalid pattern station - use one of: ${PATTERN_SCAN_STATIONS.join(", ")}.` },
        { status: 400 }
      );
    }

    const sessionScanner: ScanEmployeeContext | null = session.email
      ? {
          employee_id: session.userId ?? `session:${session.email}`,
          employee_name: session.email,
          employee_id_number: session.email,
          workstation_id: null,
        }
      : null;

    const result = await executeStageScan({
      code,
      station,
      context: "pattern",
      employee_id: body.employee_id,
      workstation_id: body.workstation_id,
      // Badge preferred; logged-in pattern operator is enough when no badge.
      require_employee: false,
      session_scanner: sessionScanner,
      updated_by: session.email,
      source: "erp",
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed.";
    const status = message.includes("not recognized") || message.includes("No pattern job")
      ? 404
      : message.includes("badge") || message.includes("Employee not found")
        ? 401
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
