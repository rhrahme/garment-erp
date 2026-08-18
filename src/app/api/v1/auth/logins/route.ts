import { NextResponse } from "next/server";
import { listLoginEvents } from "@/lib/data/login-events";
import { verifyApiKey } from "@/lib/integrations/api-auth";

/** Zapier/API parity: list recent login attempts (who, time, device, IP). */

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  const events = await listLoginEvents(300);
  return NextResponse.json({ events, count: events.length, source: "api" });
}
