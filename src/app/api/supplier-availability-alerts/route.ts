import { NextResponse } from "next/server";
import { listSupplierAvailabilityAlerts } from "@/lib/integrations/supplier-availability-store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pendingOnly = url.searchParams.get("pending") === "1";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 200);

  const alerts = listSupplierAvailabilityAlerts({ pendingOnly, limit });
  const pending_count = listSupplierAvailabilityAlerts({ pendingOnly: true }).length;

  return NextResponse.json({ alerts, pending_count });
}
