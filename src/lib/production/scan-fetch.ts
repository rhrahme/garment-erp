const SCAN_FETCH_TIMEOUT_MS = 12_000;

export async function postStageScan(body: Record<string, unknown>): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SCAN_FETCH_TIMEOUT_MS);
  const context = typeof body.context === "string" ? body.context : "";
  const endpoint = context === "pattern" ? "/api/pattern/scan" : "/api/production/stage-scan";

  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}
