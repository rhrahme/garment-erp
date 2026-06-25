import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

const AUTH_HEALTH_DOCUMENT_ID = "auth_health_monitor";
const AUTH_HEALTH_TIMEOUT_MS = 10_000;
const AUTH_HEALTH_READ_TIMEOUT_MS = 3_000;
const RESTART_COOLDOWN_MS = 30 * 60 * 1000;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;
export const AUTH_UNHEALTHY_BANNER_TTL_MS = 15 * 60 * 1000;

export interface AuthHealthRecord {
  lastCheckedAt: string;
  healthy: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  lastRestartAttemptAt: string | null;
  lastRestartResult: string | null;
  lastAlertAt: string | null;
}

const DEFAULT_RECORD: AuthHealthRecord = {
  lastCheckedAt: "",
  healthy: true,
  statusCode: null,
  latencyMs: null,
  error: null,
  lastFailureAt: null,
  consecutiveFailures: 0,
  lastRestartAttemptAt: null,
  lastRestartResult: null,
  lastAlertAt: null,
};

let memoryRecord: AuthHealthRecord | null = null;

export function getSupabaseProjectRef(): string | null {
  const explicit = process.env.SUPABASE_PROJECT_REF?.trim();
  if (explicit) return explicit;

  const url = getSupabaseUrl();
  const match = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return match?.[1] ?? null;
}

export function getSupabaseAccessToken(): string | null {
  return process.env.SUPABASE_ACCESS_TOKEN?.trim() || null;
}

export async function readAuthHealthRecord(): Promise<AuthHealthRecord> {
  if (memoryRecord) return memoryRecord;

  const admin = getSupabaseAdmin();
  if (!admin) return { ...DEFAULT_RECORD };

  try {
    const readPromise = admin
      .from("erp_documents")
      .select("data")
      .eq("id", AUTH_HEALTH_DOCUMENT_ID)
      .maybeSingle();

    const result = await Promise.race([
      readPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), AUTH_HEALTH_READ_TIMEOUT_MS)),
    ]);

    if (!result) {
      console.warn("[auth-health] readAuthHealthRecord timed out — using default");
      return { ...DEFAULT_RECORD };
    }

    const { data, error } = result;
    if (error || !data?.data) {
      return { ...DEFAULT_RECORD };
    }

    memoryRecord = { ...DEFAULT_RECORD, ...(data.data as Partial<AuthHealthRecord>) };
    return memoryRecord;
  } catch {
    return { ...DEFAULT_RECORD };
  }
}

export async function writeAuthHealthRecord(record: AuthHealthRecord): Promise<void> {
  memoryRecord = record;

  const admin = getSupabaseAdmin();
  if (!admin) return;

  try {
    await admin.from("erp_documents").upsert({
      id: AUTH_HEALTH_DOCUMENT_ID,
      data: record,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[auth-health] Failed to persist health record:", error);
  }
}

export function isAuthRecentlyUnhealthy(record: AuthHealthRecord, now = Date.now()): boolean {
  if (!record.lastFailureAt) return false;
  if (record.healthy) return false;
  const failedAt = Date.parse(record.lastFailureAt);
  if (Number.isNaN(failedAt)) return false;
  return now - failedAt < AUTH_UNHEALTHY_BANNER_TTL_MS;
}

export async function checkSupabaseAuthHealth(): Promise<{
  healthy: boolean;
  statusCode: number | null;
  latencyMs: number;
  error: string | null;
}> {
  const url = getSupabaseUrl();
  const apikey = getSupabasePublishableKey();
  if (!url || !apikey) {
    return {
      healthy: false,
      statusCode: null,
      latencyMs: 0,
      error: "Supabase URL or publishable key not configured",
    };
  }

  const healthUrl = `${url.replace(/\/$/, "")}/auth/v1/health`;
  const started = Date.now();

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      headers: { apikey, Authorization: `Bearer ${apikey}` },
      signal: AbortSignal.timeout(AUTH_HEALTH_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - started;

    if (response.ok) {
      return { healthy: true, statusCode: response.status, latencyMs, error: null };
    }

    const body = await response.text().catch(() => "");
    return {
      healthy: false,
      statusCode: response.status,
      latencyMs,
      error: body.trim() || `HTTP ${response.status}`,
    };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const message =
      error instanceof Error
        ? error.name === "TimeoutError" || error.name === "AbortError"
          ? "Auth health check timed out"
          : error.message
        : "Auth health check failed";
    return { healthy: false, statusCode: null, latencyMs, error: message };
  }
}

export async function restartSupabaseProject(): Promise<{
  attempted: boolean;
  ok: boolean;
  message: string;
}> {
  const token = getSupabaseAccessToken();
  const ref = getSupabaseProjectRef();

  if (!token) {
    return {
      attempted: false,
      ok: false,
      message: "SUPABASE_ACCESS_TOKEN not configured — manual restart required",
    };
  }
  if (!ref) {
    return {
      attempted: false,
      ok: false,
      message: "Could not resolve Supabase project ref from NEXT_PUBLIC_SUPABASE_URL",
    };
  }

  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/restart`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(30_000),
    });

    const body = await response.text().catch(() => "");
    if (response.ok) {
      return {
        attempted: true,
        ok: true,
        message: body.trim() || "Project restart initiated",
      };
    }

    return {
      attempted: true,
      ok: false,
      message: `Restart failed (${response.status}): ${body.trim() || "unknown error"}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Restart request failed";
    return { attempted: true, ok: false, message };
  }
}

function canAttemptRestart(record: AuthHealthRecord, now = Date.now()): boolean {
  if (!record.lastRestartAttemptAt) return true;
  const last = Date.parse(record.lastRestartAttemptAt);
  if (Number.isNaN(last)) return true;
  return now - last >= RESTART_COOLDOWN_MS;
}

function canSendAlert(record: AuthHealthRecord, now = Date.now()): boolean {
  if (!record.lastAlertAt) return true;
  const last = Date.parse(record.lastAlertAt);
  if (Number.isNaN(last)) return true;
  return now - last >= ALERT_COOLDOWN_MS;
}

export interface AuthHealthRunResult {
  checkedAt: string;
  healthy: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
  consecutiveFailures: number;
  restart: { attempted: boolean; ok: boolean; message: string } | null;
  alertSent: boolean;
}

export async function runAuthHealthMonitor(options?: {
  sendAlert?: (details: AuthHealthRunResult) => Promise<void>;
}): Promise<AuthHealthRunResult> {
  const now = Date.now();
  const checkedAt = new Date(now).toISOString();
  const previous = await readAuthHealthRecord();
  const check = await checkSupabaseAuthHealth();

  let restart: AuthHealthRunResult["restart"] = null;
  let alertSent = false;

  const consecutiveFailures = check.healthy ? 0 : previous.consecutiveFailures + 1;

  if (!check.healthy && canAttemptRestart(previous, now)) {
    restart = await restartSupabaseProject();
    previous.lastRestartAttemptAt = checkedAt;
    previous.lastRestartResult = restart.message;
  }

  const result: AuthHealthRunResult = {
    checkedAt,
    healthy: check.healthy,
    statusCode: check.statusCode,
    latencyMs: check.latencyMs,
    error: check.error,
    consecutiveFailures,
    restart,
    alertSent: false,
  };

  if (!check.healthy && options?.sendAlert && canSendAlert(previous, now)) {
    try {
      await options.sendAlert(result);
      alertSent = true;
    } catch (error) {
      console.error("[auth-health] Alert failed:", error);
    }
  }
  result.alertSent = alertSent;

  const record: AuthHealthRecord = {
    lastCheckedAt: checkedAt,
    healthy: check.healthy,
    statusCode: check.statusCode,
    latencyMs: check.latencyMs,
    error: check.error,
    lastFailureAt: check.healthy ? previous.lastFailureAt : checkedAt,
    consecutiveFailures,
    lastRestartAttemptAt: restart?.attempted ? checkedAt : previous.lastRestartAttemptAt,
    lastRestartResult: restart?.message ?? previous.lastRestartResult,
    lastAlertAt: alertSent ? checkedAt : previous.lastAlertAt,
  };

  if (check.healthy) {
    record.lastFailureAt = null;
    record.consecutiveFailures = 0;
  }

  await writeAuthHealthRecord(record);
  return result;
}
