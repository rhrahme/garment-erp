import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { listLoginEvents } from "@/lib/data/login-events";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionContext();
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  const events = await listLoginEvents(300);
  return NextResponse.json({ events });
}
