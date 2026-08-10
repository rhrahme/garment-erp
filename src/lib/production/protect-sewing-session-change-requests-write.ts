/**
 * Last-line defense for sewing_session_change_requests whole-document upserts.
 * Stale caches must not wipe pending admin approvals.
 */

export type ProtectableSewingSessionChangeRequests = {
  updated_at?: string | null;
  requests?: Array<{ id?: string; status?: string }> | null;
  allow_testing_reset?: boolean;
  [key: string]: unknown;
};

function requestCount(store: ProtectableSewingSessionChangeRequests): number {
  return Array.isArray(store.requests) ? store.requests.length : 0;
}

function pendingCount(store: ProtectableSewingSessionChangeRequests): number {
  if (!Array.isArray(store.requests)) return 0;
  return store.requests.filter((row) => row.status === "pending").length;
}

export function protectSewingSessionChangeRequestsWrite(
  remote: ProtectableSewingSessionChangeRequests,
  incoming: ProtectableSewingSessionChangeRequests
): ProtectableSewingSessionChangeRequests {
  const allowReset = incoming.allow_testing_reset === true;
  const { allow_testing_reset: _flag, ...cleanIncoming } = incoming;
  const remoteRequests = Array.isArray(remote.requests) ? remote.requests : [];
  const incomingRequests = Array.isArray(cleanIncoming.requests) ? cleanIncoming.requests : [];

  if (incomingRequests.length === 0 && remoteRequests.length > 0 && !allowReset) {
    throw new Error(
      `Refusing to wipe sewing_session_change_requests (remote=${requestCount(remote)}, pending=${pendingCount(remote)} -> empty).`
    );
  }

  if (allowReset) {
    return {
      ...cleanIncoming,
      requests: Array.isArray(cleanIncoming.requests) ? cleanIncoming.requests : [],
    };
  }

  const incomingIds = new Set(
    incomingRequests.map((row) => row.id).filter((id): id is string => Boolean(id))
  );
  const merged = [...incomingRequests];
  for (const row of remoteRequests) {
    if (row.id && !incomingIds.has(row.id)) {
      merged.push(row);
    }
  }

  return {
    ...remote,
    ...cleanIncoming,
    requests: merged,
  };
}
