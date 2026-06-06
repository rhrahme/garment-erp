import { NextResponse } from "next/server";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import { listFabricReceivingOverview } from "@/lib/production/fabric-receiving";

export async function GET(request: Request) {
  try {
    await ensureFabricReceivingDocumentsLoaded();
    const url = new URL(request.url);
    const filter = url.searchParams.get("filter") === "all_open" ? "all_open" : "actionable";
    const overview = await listFabricReceivingOverview(filter);
    return NextResponse.json(overview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load fabric receiving overview.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
