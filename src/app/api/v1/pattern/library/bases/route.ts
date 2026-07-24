import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensurePatternLibraryLoaded, readPatternLibraryFresh } from "@/lib/data/pattern-library";
import { createBasePattern } from "@/lib/pattern-library/mutations";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const store = await readPatternLibraryFresh();
    return NextResponse.json({ base_patterns: store.base_patterns, dictionary: store.dictionary });
  } catch (error) {
    console.error("Failed to list base patterns (API):", error);
    return NextResponse.json({ error: "Failed to list base patterns." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const body = await request.json();
    const result = await createBasePattern(body, {
      createdBy: typeof body.created_by === "string" ? body.created_by : "api",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ base: result.base, source: "api" }, { status: 201 });
  } catch (error) {
    console.error("Failed to create base pattern (API):", error);
    return NextResponse.json({ error: "Failed to create base pattern." }, { status: 500 });
  }
}
