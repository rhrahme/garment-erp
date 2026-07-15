import { NextResponse } from "next/server";
import { ensureOrphanedClientsReconciled } from "@/lib/data/clients";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import { notifyIntegration } from "@/lib/integrations";
import { listFabricReceivingOverview } from "@/lib/production/fabric-receiving";

export async function GET(request: Request) {
  try {
    await ensureFabricReceivingDocumentsLoaded();
    const reconciliation = await ensureOrphanedClientsReconciled();
    if (reconciliation.restored.length > 0) {
      for (const client of reconciliation.restored) {
        await notifyIntegration("client.created", {
          id: client.id,
          code: client.code,
          first_name: client.first_name,
          middle_name: client.middle_name,
          last_name: client.last_name,
          brand_ids: client.brand_ids,
          restored_from: "orphan_reconciliation",
        });
      }
    }
    const url = new URL(request.url);
    const filter = url.searchParams.get("filter") === "all_open" ? "all_open" : "actionable";
    const overview = await listFabricReceivingOverview(filter);
    return NextResponse.json(overview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load fabric receiving overview.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
