/**
 * Last-line defense for sewing_sessions / sewing_scan_failures whole-document
 * upserts. Same class of bug as pattern_library / fabric_orders: a stale Vercel
 * cache must never wipe open arms, sessions, or the failure audit log.
 */

export type ProtectableSewingSessions = {
  updated_at?: string | null;
  kiosk_arms?: unknown[] | null;
  kiosk_piece_arms?: unknown[] | null;
  sessions?: Array<{ id?: string; status?: string }> | null;
  /** Explicit testing reset may clear the floor. Stripped before persist. */
  allow_testing_reset?: boolean;
  [key: string]: unknown;
};

export type ProtectableSewingScanFailures = {
  updated_at?: string | null;
  failures?: unknown[] | null;
  allow_testing_reset?: boolean;
  [key: string]: unknown;
};

function sessionCount(store: ProtectableSewingSessions): number {
  return Array.isArray(store.sessions) ? store.sessions.length : 0;
}

function armCount(store: ProtectableSewingSessions): number {
  const arms = Array.isArray(store.kiosk_arms) ? store.kiosk_arms.length : 0;
  const pieces = Array.isArray(store.kiosk_piece_arms) ? store.kiosk_piece_arms.length : 0;
  return arms + pieces;
}

function openCount(store: ProtectableSewingSessions): number {
  if (!Array.isArray(store.sessions)) return 0;
  return store.sessions.filter(
    (session) => session.status === "open" || session.status === "closing"
  ).length;
}

export function isSewingSessionsEmpty(store: ProtectableSewingSessions): boolean {
  return sessionCount(store) === 0 && armCount(store) === 0;
}

export function protectSewingSessionsWrite(
  remote: ProtectableSewingSessions,
  incoming: ProtectableSewingSessions
): ProtectableSewingSessions {
  const allowReset = incoming.allow_testing_reset === true;
  const { allow_testing_reset: _flag, ...cleanIncoming } = incoming;

  if (isSewingSessionsEmpty(cleanIncoming) && !isSewingSessionsEmpty(remote) && !allowReset) {
    throw new Error(
      `Refusing to wipe sewing_sessions (remote sessions=${sessionCount(remote)}, open=${openCount(remote)}, arms=${armCount(remote)} -> empty).`
    );
  }

  if (allowReset) {
    return {
      ...cleanIncoming,
      kiosk_arms: Array.isArray(cleanIncoming.kiosk_arms) ? cleanIncoming.kiosk_arms : [],
      kiosk_piece_arms: Array.isArray(cleanIncoming.kiosk_piece_arms)
        ? cleanIncoming.kiosk_piece_arms
        : [],
      sessions: Array.isArray(cleanIncoming.sessions) ? cleanIncoming.sessions : [],
    };
  }

  // Stale write with fewer sessions than remote: keep remote sessions missing
  // from incoming (by id) so concurrent kiosks cannot erase each other.
  const remoteSessions = Array.isArray(remote.sessions) ? remote.sessions : [];
  const incomingSessions = Array.isArray(cleanIncoming.sessions) ? cleanIncoming.sessions : [];
  const incomingIds = new Set(
    incomingSessions.map((session) => session.id).filter((id): id is string => Boolean(id))
  );
  const mergedSessions = [...incomingSessions];
  for (const session of remoteSessions) {
    if (session.id && !incomingIds.has(session.id)) {
      mergedSessions.push(session);
    }
  }

  return {
    ...remote,
    ...cleanIncoming,
    sessions: mergedSessions,
    kiosk_arms: Array.isArray(cleanIncoming.kiosk_arms)
      ? cleanIncoming.kiosk_arms
      : remote.kiosk_arms ?? [],
    kiosk_piece_arms: Array.isArray(cleanIncoming.kiosk_piece_arms)
      ? cleanIncoming.kiosk_piece_arms
      : remote.kiosk_piece_arms ?? [],
  };
}

export function protectSewingScanFailuresWrite(
  remote: ProtectableSewingScanFailures,
  incoming: ProtectableSewingScanFailures
): ProtectableSewingScanFailures {
  const allowReset = incoming.allow_testing_reset === true;
  const { allow_testing_reset: _flag, ...cleanIncoming } = incoming;
  const remoteFailures = Array.isArray(remote.failures) ? remote.failures : [];
  const incomingFailures = Array.isArray(cleanIncoming.failures) ? cleanIncoming.failures : [];

  if (incomingFailures.length === 0 && remoteFailures.length > 0 && !allowReset) {
    throw new Error(
      `Refusing to wipe sewing_scan_failures (${remoteFailures.length} rows -> 0).`
    );
  }

  if (allowReset) {
    return {
      ...cleanIncoming,
      failures: Array.isArray(cleanIncoming.failures) ? cleanIncoming.failures : [],
    };
  }

  // Prefer the longer failure list (append-only audit). Stale shorter snapshots lose.
  if (remoteFailures.length > incomingFailures.length) {
    return {
      ...cleanIncoming,
      failures: remoteFailures,
    };
  }

  return {
    ...remote,
    ...cleanIncoming,
    failures: incomingFailures,
  };
}
