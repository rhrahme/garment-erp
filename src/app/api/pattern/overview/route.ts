import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternDocumentsLoaded } from "@/lib/data/pattern-jobs";
import { listPatternOverview } from "@/lib/pattern/overview";

export async function GET() {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }

    await ensurePatternDocumentsLoaded();
    const overview = await listPatternOverview();
    return NextResponse.json(overview);
  } catch (error) {
    console.error("Failed to load pattern overview:", error);
    return NextResponse.json({ error: "Failed to load pattern overview." }, { status: 500 });
  }
}
