import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { listSupplierReplies } from "@/lib/integrations/supplier-reply-store";

export async function GET() {
  try {
    await ensureDocumentsLoaded(["supplier_replies"]);
    const replies = listSupplierReplies();
    return NextResponse.json({ replies });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load supplier replies.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
