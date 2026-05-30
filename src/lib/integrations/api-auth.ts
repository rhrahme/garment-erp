import { NextResponse } from "next/server";

export function getApiKey(): string | null {
  return process.env.ERP_API_KEY?.trim() || null;
}

export function verifyApiKey(request: Request): NextResponse | null {
  const expected = getApiKey();
  if (!expected) {
    return NextResponse.json(
      { error: "ERP API key not configured. Set ERP_API_KEY in .env.local for Zapier." },
      { status: 503 }
    );
  }

  const auth = request.headers.get("authorization")?.trim();
  const headerKey = request.headers.get("x-api-key")?.trim();
  const provided = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : headerKey;

  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
