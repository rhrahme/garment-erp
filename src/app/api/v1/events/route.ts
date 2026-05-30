import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { listIntegrationEvents } from "@/lib/integrations/event-log";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);

  return NextResponse.json({ events: listIntegrationEvents(limit) });
}
