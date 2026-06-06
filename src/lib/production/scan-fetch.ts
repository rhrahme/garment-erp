const SCAN_FETCH_TIMEOUT_MS = 12_000;

export async function postStageScan(body: Record<string, unknown>): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SCAN_FETCH_TIMEOUT_MS);

  try {
    return await fetch("/api/production/stage-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}
