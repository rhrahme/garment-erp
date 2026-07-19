import { NextResponse } from "next/server";
import { healClientDataForRead } from "@/lib/clients/heal-on-read";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import { listActiveFabricReceipts } from "@/lib/production/fabric-receiving";

export async function GET() {
  try {
    await ensureFabricReceivingDocumentsLoaded();
    // Same heal as the overview route — receipts resolve client names for every role.
    await healClientDataForRead();
    const receipts = listActiveFabricReceipts();
    return NextResponse.json({ receipts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load fabric receipts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
