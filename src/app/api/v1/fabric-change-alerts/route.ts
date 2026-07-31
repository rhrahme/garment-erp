import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  listFabricChangeAlerts,
  listFabricChangeAlertsForClient,
  listOutstandingFabricChangeAlertsForClient,
  listOutstandingFabricChangeAlertsForRole,
} from "@/lib/data/fabric-change-alerts";
import type { FabricChangeAlertRole } from "@/lib/types/fabric-change-alerts";
import { FABRIC_CHANGE_ALERT_ROLES } from "@/lib/types/fabric-change-alerts";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensureDocumentsLoaded(["fabric_change_alerts"]);
    const url = new URL(request.url);
    const clientId = url.searchParams.get("client_id")?.trim() ?? "";
    const roleParam = url.searchParams.get("role")?.trim() as FabricChangeAlertRole | "";
    const role =
      roleParam && FABRIC_CHANGE_ALERT_ROLES.includes(roleParam) ? roleParam : null;
    const outstandingOnly = url.searchParams.get("outstanding") !== "0";
    const limit = Math.min(
      200,
      Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50)
    );

    if (clientId) {
      const alerts = outstandingOnly
        ? listOutstandingFabricChangeAlertsForClient(clientId, role ?? undefined, limit)
        : listFabricChangeAlertsForClient(clientId, limit);
      return NextResponse.json({ alerts, role, source: "api" });
    }

    if (role && outstandingOnly) {
      return NextResponse.json({
        alerts: listOutstandingFabricChangeAlertsForRole(role, limit),
        role,
        source: "api",
      });
    }

    return NextResponse.json({
      alerts: listFabricChangeAlerts(limit),
      role,
      source: "api",
    });
  } catch (error) {
    console.error("Failed to list fabric change alerts (API):", error);
    return NextResponse.json({ error: "Failed to load fabric change alerts." }, { status: 500 });
  }
}
