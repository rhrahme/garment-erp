import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternLibraryLoaded, readPatternLibraryFresh } from "@/lib/data/pattern-library";

export async function GET() {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const store = await readPatternLibraryFresh();
    return NextResponse.json(store);
  } catch (error) {
    console.error("Failed to load pattern library:", error);
    return NextResponse.json({ error: "Failed to load pattern library." }, { status: 500 });
  }
}
