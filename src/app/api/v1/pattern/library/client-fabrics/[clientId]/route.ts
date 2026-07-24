import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { loadClientFabricBoard } from "@/lib/pattern-library/load-client-fabric-board";

/** Zapier/API parity: client fabric board (price-free). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const { clientId } = await params;
    const board = await loadClientFabricBoard(clientId);
    return NextResponse.json(board);
  } catch (error) {
    console.error("Failed to load client fabric board (API):", error);
    return NextResponse.json({ error: "Failed to load client fabric board." }, { status: 500 });
  }
}
