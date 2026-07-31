import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { acknowledgeFabricChangeAlert } from "@/lib/sales-orders/acknowledge-fabric-change-alert";
import {
  canViewFabricChangeAlerts,
  fabricChangeAlertRoleFromSession,
} from "@/lib/sales-orders/fabric-change-alert-role";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!canViewFabricChangeAlerts(session)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const role = fabricChangeAlertRoleFromSession(session);
  if (!role) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as { action?: string };
    if (body.action !== "acknowledge") {
      return NextResponse.json(
        { error: 'action must be "acknowledge".' },
        { status: 400 }
      );
    }

    const result = await acknowledgeFabricChangeAlert(
      id,
      role,
      session.email ?? "unknown"
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ alert: result.alert, role });
  } catch (error) {
    console.error("Failed to acknowledge fabric change alert:", error);
    return NextResponse.json({ error: "Failed to acknowledge alert." }, { status: 500 });
  }
}
