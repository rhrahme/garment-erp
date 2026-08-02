import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensurePatternLibraryLoaded, getBasePatternByIdFresh } from "@/lib/data/pattern-library";
import {
  deleteBasePatternClientColumn,
  saveBasePatternClientColumn,
} from "@/lib/pattern-library/mutations";

/** List the client fit columns on a base pattern (Zapier / API parity). */
export async function GET(request: Request, context: { params: Promise<{ baseId: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const { baseId } = await context.params;
    const base = await getBasePatternByIdFresh(baseId);
    if (!base) {
      return NextResponse.json({ error: "Base pattern not found." }, { status: 404 });
    }
    return NextResponse.json({
      base_pattern_id: base.id,
      sizes: base.sizes,
      client_columns: base.client_columns ?? [],
    });
  } catch (error) {
    console.error("Failed to list client fit columns (API):", error);
    return NextResponse.json({ error: "Failed to load client fit columns." }, { status: 500 });
  }
}

/** Upsert a client fit column - same action as the pattern UI save. */
export async function PUT(request: Request, context: { params: Promise<{ baseId: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
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
      { savedBy: typeof body.saved_by === "string" ? body.saved_by : "api" }
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ base: result.base, column: result.column, source: "api" });
  } catch (error) {
    console.error("Failed to save client fit column (API):", error);
    return NextResponse.json({ error: "Failed to save client fit column." }, { status: 500 });
  }
}

/** Remove a client's fit column (?client_id= or JSON body). */
export async function DELETE(request: Request, context: { params: Promise<{ baseId: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const { baseId } = await context.params;
    const url = new URL(request.url);
    let clientId = url.searchParams.get("client_id") ?? "";
    let removedBy = "api";
    if (!clientId) {
      const body = await request.json().catch(() => null);
      clientId = typeof body?.client_id === "string" ? body.client_id : "";
      if (typeof body?.removed_by === "string") removedBy = body.removed_by;
    }
    const result = await deleteBasePatternClientColumn(baseId, clientId, { removedBy });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ base: result.base, source: "api" });
  } catch (error) {
    console.error("Failed to remove client fit column (API):", error);
    return NextResponse.json({ error: "Failed to remove client fit column." }, { status: 500 });
  }
}
