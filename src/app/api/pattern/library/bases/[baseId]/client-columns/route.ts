import { NextResponse } from "next/server";
import { requirePatternAccess, sessionActor } from "@/lib/auth/session";
import { ensurePatternLibraryLoaded } from "@/lib/data/pattern-library";
import {
  deleteBasePatternClientColumn,
  saveBasePatternClientColumn,
} from "@/lib/pattern-library/mutations";

/** Upsert a client fit column on the base pattern size grid. */
export async function PUT(request: Request, context: { params: Promise<{ baseId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const { baseId } = await context.params;
    const body = await request.json();
    const result = await saveBasePatternClientColumn(
      baseId,
      {
        client_id: body.client_id,
        client_code: body.client_code ?? null,
        client_name: body.client_name,
        base_size: body.base_size,
        values: body.values ?? null,
      },
      { savedBy: sessionActor(session) }
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ base: result.base, column: result.column });
  } catch (error) {
    console.error("Failed to save client fit column:", error);
    return NextResponse.json({ error: "Failed to save client fit column." }, { status: 500 });
  }
}

/** Remove a client's fit column (?client_id= or JSON body). */
export async function DELETE(request: Request, context: { params: Promise<{ baseId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const { baseId } = await context.params;
    const url = new URL(request.url);
    let clientId = url.searchParams.get("client_id") ?? "";
    if (!clientId) {
      const body = await request.json().catch(() => null);
      clientId = typeof body?.client_id === "string" ? body.client_id : "";
    }
    const result = await deleteBasePatternClientColumn(baseId, clientId, {
      removedBy: sessionActor(session),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ base: result.base });
  } catch (error) {
    console.error("Failed to remove client fit column:", error);
    return NextResponse.json({ error: "Failed to remove client fit column." }, { status: 500 });
  }
}
