import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations";
import {
  listPiecesForManualStart,
  listStitchEmployeesForManualStart,
  startSewingSessionWithoutQr,
} from "@/lib/production/start-session-without-qr";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesOrders } from "@/lib/data/sales-orders";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  try {
    await ensureDocumentsLoaded(["sales_orders", "payroll_employees"]);
    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? "";
    const pieces = listPiecesForManualStart(query, readSalesOrders().orders);
    const employees = listStitchEmployeesForManualStart();
    return NextResponse.json({ pieces, employees });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list pieces.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  try {
    const body = (await request.json().catch(() => null)) as {
      kiosk_id?: string | null;
      workstation_id?: string | null;
      employee_id?: string | null;
      production_code?: string | null;
      started_at?: string | null;
      reason?: string | null;
      actor?: string | null;
      work_kind?: "first_make" | "alteration" | null;
    } | null;

    const result = await startSewingSessionWithoutQr({
      kiosk_id: body?.kiosk_id,
      workstation_id: body?.workstation_id,
      employee_id: body?.employee_id,
      production_code: body?.production_code ?? "",
      started_at: body?.started_at,
      reason: body?.reason,
      work_kind: body?.work_kind,
      requested_by:
        typeof body?.actor === "string" && body.actor.trim() ? body.actor.trim() : "api",
      source: "api",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      session: result.session,
      request_id: result.request_id,
      already_running: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start without QR.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
