import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { testCaccioppoliApiConnection } from "@/lib/integrations/caccioppoli/client";
import {
  CACCIOPPOLI_API_BASE_URL,
  isCaccioppoliApiConfigured,
} from "@/lib/integrations/caccioppoli/config";

export async function GET() {
  try {
    await requireAdmin();
    const configured = isCaccioppoliApiConfigured();
    if (!configured) {
      return NextResponse.json({
        configured: false,
        connected: false,
        base_url: CACCIOPPOLI_API_BASE_URL,
        message:
          "Add CACCIOPPOLI_API_TOKEN to .env.local (Bearer token from Caccioppoli / GR Sistemi), then restart the dev server.",
      });
    }

    const test = await testCaccioppoliApiConnection();
    const usage = test.usage;

    return NextResponse.json({
      configured: true,
      connected: test.ok,
      base_url: CACCIOPPOLI_API_BASE_URL,
      message: test.message,
      account: usage?.clientDescription ?? null,
      usage: usage
        ? {
            year: usage.year,
            used_requests: usage.usedRequests,
            annual_limit: usage.annualLimit,
            remaining_requests: usage.remainingRequests,
          }
        : null,
      sample: test.sample ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to check Caccioppoli API.";
    const status = message.toLowerCase().includes("admin") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
