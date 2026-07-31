import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  listFabricChangeAlerts,
  listFabricChangeAlertsForClient,
  listOutstandingFabricChangeAlertsForClient,
  listOutstandingFabricChangeAlertsForRole,
} from "@/lib/data/fabric-change-alerts";
import {
  canViewFabricChangeAlerts,
  fabricChangeAlertRoleFromSession,
} from "@/lib/sales-orders/fabric-change-alert-role";

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!canViewFabricChangeAlerts(session)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    await ensureDocumentsLoaded(["fabric_change_alerts"]);
    const role = fabricChangeAlertRoleFromSession(session)!;
    const url = new URL(request.url);
    const clientId = url.searchParams.get("client_id")?.trim() ?? "";
    const outstandingOnly = url.searchParams.get("outstanding") !== "0";
    const limit = Math.min(
      200,
      Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50)
    );

    if (clientId) {
      const alerts = outstandingOnly
        ? listOutstandingFabricChangeAlertsForClient(clientId, role, limit)
        : listFabricChangeAlertsForClient(clientId, limit);
      return NextResponse.json({ alerts, role });
    }

    if (session.isAdmin && url.searchParams.get("all") === "1") {
      return NextResponse.json({ alerts: listFabricChangeAlerts(limit), role });
    }

    const alerts = outstandingOnly
      ? listOutstandingFabricChangeAlertsForRole(role, limit)
      : listFabricChangeAlerts(limit);

    return NextResponse.json({ alerts, role });
  } catch (error) {
    console.error("Failed to list fabric change alerts:", error);
    return NextResponse.json({ error: "Failed to load fabric change alerts." }, { status: 500 });
  }
}
