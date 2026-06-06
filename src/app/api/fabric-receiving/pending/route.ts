import { NextResponse } from "next/server";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import { listPendingFabricLines } from "@/lib/production/fabric-receiving";

export async function GET() {
  try {
    await ensureFabricReceivingDocumentsLoaded();
    const pending = listPendingFabricLines();
    return NextResponse.json({ pending });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load pending fabric.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
