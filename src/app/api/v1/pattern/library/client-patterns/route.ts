import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensurePatternLibraryLoaded, readPatternLibraryFresh } from "@/lib/data/pattern-library";
import { createClientPattern } from "@/lib/pattern-library/mutations";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const store = await readPatternLibraryFresh();
    return NextResponse.json({ client_patterns: store.client_patterns });
  } catch (error) {
    console.error("Failed to list client patterns (API):", error);
    return NextResponse.json({ error: "Failed to list client patterns." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const body = await request.json();
    const result = await createClientPattern(body, {
      createdBy: typeof body.created_by === "string" ? body.created_by : "api",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ pattern: result.pattern, source: "api" }, { status: 201 });
  } catch (error) {
    console.error("Failed to create client pattern (API):", error);
    return NextResponse.json({ error: "Failed to create client pattern." }, { status: 500 });
  }
}
