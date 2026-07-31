import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { acknowledgeFabricChangeAlert } from "@/lib/sales-orders/acknowledge-fabric-change-alert";
import type { FabricChangeAlertRole } from "@/lib/types/fabric-change-alerts";
import { FABRIC_CHANGE_ALERT_ROLES } from "@/lib/types/fabric-change-alerts";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      action?: string;
      role?: string;
      acknowledged_by?: string;
    };
    if (body.action !== "acknowledge") {
      return NextResponse.json(
        { error: 'action must be "acknowledge".' },
        { status: 400 }
      );
    }

    const role = (body.role?.trim() || "admin") as FabricChangeAlertRole;
    if (!FABRIC_CHANGE_ALERT_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    const acknowledgedBy = body.acknowledged_by?.trim() || "api";
    const result = await acknowledgeFabricChangeAlert(id, role, acknowledgedBy);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ alert: result.alert, role, source: "api" });
  } catch (error) {
    console.error("Failed to acknowledge fabric change alert (API):", error);
    return NextResponse.json({ error: "Failed to acknowledge alert." }, { status: 500 });
  }
}
