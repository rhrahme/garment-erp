import { NextResponse } from "next/server";
import { requireAuthenticated, type SessionContext } from "@/lib/auth/session";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import { updateFabricDefectStatus } from "@/lib/production/fabric-receiving-defects";

function canManageDefects(session: SessionContext): boolean {
  return session.isAdmin || session.isClientManager;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ receiptId: string; defectId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!canManageDefects(session)) {
    return NextResponse.json({ error: "Admin or QC access required." }, { status: 403 });
  }

  try {
    await ensureFabricReceivingDocumentsLoaded();
    const { receiptId, defectId } = await context.params;
    const body = (await request.json()) as { action?: string };
    const action = body.action === "acknowledge" || body.action === "resolve" ? body.action : null;
    if (!action) {
      return NextResponse.json(
        { error: 'action must be "acknowledge" or "resolve".' },
        { status: 400 }
      );
    }

    const result = await updateFabricDefectStatus(
      receiptId,
      defectId,
      action,
      session.email ?? session.userId ?? "unknown",
      "erp"
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update defect.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
