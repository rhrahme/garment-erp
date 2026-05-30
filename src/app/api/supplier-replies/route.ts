import { NextResponse } from "next/server";
import { listSupplierReplies } from "@/lib/integrations/supplier-reply-store";

export async function GET() {
  try {
    const replies = listSupplierReplies();
    return NextResponse.json({ replies });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load supplier replies.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
