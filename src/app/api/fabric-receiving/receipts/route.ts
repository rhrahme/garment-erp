import { NextResponse } from "next/server";
import { listActiveFabricReceipts } from "@/lib/production/fabric-receiving";

export async function GET() {
  try {
    const receipts = listActiveFabricReceipts();
    return NextResponse.json({ receipts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load fabric receipts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
