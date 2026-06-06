import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { testDrapersApiConnection } from "@/lib/integrations/drapers/client";
import {
  DRAPERS_API_BASE_URL,
  DRAPERS_API_DISPLAY_NAME,
  isDrapersApiConfigured,
} from "@/lib/integrations/drapers/config";

export async function GET() {
  try {
    await requireAdmin();
    const configured = isDrapersApiConfigured();
    if (!configured) {
      return NextResponse.json({
        configured: false,
        connected: false,
        base_url: DRAPERS_API_BASE_URL,
        message: "Add DRAPERS_API_KEY to .env.local (Access Key from Drapers Company Area → API Integration), then restart the dev server.",
      });
    }

    const test = await testDrapersApiConnection();
    const profile = test.profile;

    return NextResponse.json({
      configured: true,
      connected: test.ok,
      base_url: DRAPERS_API_BASE_URL,
      message: test.message,
      account: test.ok ? DRAPERS_API_DISPLAY_NAME : null,
      capabilities: profile?.capabilities ?? null,
      key_expires: profile?.access_key.expiration_date
        ? new Date(profile.access_key.expiration_date * 1000).toISOString().slice(0, 10)
        : null,
      rate_limit: profile?.profile.rate_limit,
      current_rate: profile?.profile.current_rate,
      sample: test.sample ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to check Drapers API.";
    const status = message.toLowerCase().includes("admin") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
