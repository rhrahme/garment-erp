import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { listOutstandingPatternAlterationPending } from "@/lib/data/pattern-alteration-pending";
import { verifyApiKey } from "@/lib/integrations/api-auth";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  await ensureDocumentsLoaded(["pattern_alteration_pending"]);
  const items = listOutstandingPatternAlterationPending(100);
  return NextResponse.json({ items, source: "api" });
}
