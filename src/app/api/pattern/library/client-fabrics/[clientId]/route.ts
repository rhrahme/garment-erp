import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { loadClientFabricBoard } from "@/lib/pattern-library/load-client-fabric-board";

/** Client fabric board — all fabric articles for one client, price-free. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    const { clientId } = await params;
    const board = await loadClientFabricBoard(clientId);
    return NextResponse.json(board);
  } catch (error) {
    console.error("Failed to load client fabric board:", error);
    return NextResponse.json({ error: "Failed to load client fabric board." }, { status: 500 });
  }
}
