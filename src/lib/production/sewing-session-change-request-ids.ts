/**
 * Admin / Zapier decide payloads accept one `request_id` or a `request_ids`
 * list so the dashboard can Confirm/Reject a selected batch.
 */
export function collectSewingSessionChangeRequestIds(input: {
  request_id?: unknown;
  request_ids?: unknown;
}): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  function add(value: unknown) {
    if (typeof value !== "string") return;
    const id = value.trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  }

  add(input.request_id);
  if (Array.isArray(input.request_ids)) {
    for (const value of input.request_ids) add(value);
  }
  return ids;
}
