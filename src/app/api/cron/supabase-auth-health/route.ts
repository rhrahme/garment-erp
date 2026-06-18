import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verify-cron-secret";
import { parseSuperAdminEmails } from "@/lib/auth/permissions";
import {
  getSupabaseProjectRef,
  runAuthHealthMonitor,
  type AuthHealthRunResult,
} from "@/lib/supabase/auth-health";
import { sendEmail } from "@/lib/email/smtp";
import { emitZapierEvent } from "@/lib/integrations/zapier";

async function sendAuthHealthAlert(details: AuthHealthRunResult): Promise<void> {
  const ref = getSupabaseProjectRef() ?? "unknown";
  const summary = [
    `Supabase Auth (GoTrue) health check failed for project ${ref}.`,
    "",
    `Time: ${details.checkedAt}`,
    `Status: ${details.statusCode ?? "timeout/network"}`,
    `Error: ${details.error ?? "unknown"}`,
    `Consecutive failures: ${details.consecutiveFailures}`,
    details.restart
      ? `Auto-restart: ${details.restart.ok ? "initiated" : "failed"} — ${details.restart.message}`
      : "Auto-restart: skipped (cooldown or not configured)",
    "",
    "Users may see login errors until Auth recovers. Check Supabase dashboard → Project Settings → Infrastructure.",
  ].join("\n");

  void emitZapierEvent("supabase.auth_unhealthy", {
    project_ref: ref,
    checked_at: details.checkedAt,
    status_code: details.statusCode,
    error: details.error,
    consecutive_failures: details.consecutiveFailures,
    restart: details.restart,
  });

  const recipients = [...parseSuperAdminEmails()];
  if (recipients.length === 0) {
    console.error("[auth-health]", summary);
    return;
  }

  await sendEmail({
    to: recipients,
    subject: `[Garment ERP] Supabase Auth unhealthy — ${ref}`,
    text: summary,
  });
}

async function handleCron(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await runAuthHealthMonitor({ sendAlert: sendAuthHealthAlert });
    console.info("[auth-health] cron result:", JSON.stringify(result));

    return NextResponse.json({ ok: result.healthy, ...result });
  } catch (error) {
    console.error("[auth-health] cron failed:", error);
    const message = error instanceof Error ? error.message : "Auth health cron failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
