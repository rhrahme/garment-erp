import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { buildWashedReadyOverview } from "@/lib/pattern-library/washed-ready";

export async function GET() {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    const overview = await buildWashedReadyOverview();
    return NextResponse.json(overview);
  } catch (error) {
    console.error("Failed to load washed & ready overview:", error);
    return NextResponse.json({ error: "Failed to load washed & ready overview." }, { status: 500 });
  }
}
