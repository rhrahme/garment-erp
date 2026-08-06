/**
 * Last-line defense against whole-document clobber of pattern_library.
 *
 * Production stores one big JSON blob. A stale Vercel instance used to read an
 * older snapshot, then upsert the entire document and wipe Pattern's filled
 * measurement cells. Same class of bug as fabric_orders / supplier_contacts.
 */

export type ProtectableMeasurement = {
  base_value?: number | null;
  target_value?: number | null;
  sewn_value?: number | null;
  remarks?: string | null;
  name?: string | null;
};

export type ProtectableVersion = {
  id: string;
  measurements?: ProtectableMeasurement[] | null;
  special_instructions?: string | null;
  notes?: string | null;
  [key: string]: unknown;
};

export type ProtectableClientPattern = {
  id: string;
  versions?: ProtectableVersion[] | null;
  [key: string]: unknown;
};

export type ProtectablePatternLibrary = {
  updated_at?: string | null;
  dictionary?: unknown;
  base_patterns?: unknown;
  client_patterns?: ProtectableClientPattern[] | null;
  [key: string]: unknown;
};

export function countFilledMeasurements(
  measurements: ProtectableMeasurement[] | null | undefined
): number {
  if (!Array.isArray(measurements)) return 0;
  let filled = 0;
  for (const row of measurements) {
    if (
      row.base_value != null ||
      row.target_value != null ||
      row.sewn_value != null ||
      (typeof row.remarks === "string" && row.remarks.trim())
    ) {
      filled += 1;
    }
  }
  return filled;
}

function mergeVersions(
  remoteVersions: ProtectableVersion[],
  incomingVersions: ProtectableVersion[]
): ProtectableVersion[] {
  const remoteById = new Map(remoteVersions.map((version) => [version.id, version]));
  const incomingIds = new Set(incomingVersions.map((version) => version.id));
  const merged = incomingVersions.map((incoming) => {
    const remote = remoteById.get(incoming.id);
    if (!remote) return incoming;
    const remoteFilled = countFilledMeasurements(remote.measurements);
    const incomingFilled = countFilledMeasurements(incoming.measurements);
    // Never replace a filled trial with an empty one via a whole-document write.
    if (remoteFilled > 0 && incomingFilled === 0) {
      return {
        ...incoming,
        measurements: remote.measurements,
        special_instructions:
          incoming.special_instructions ?? remote.special_instructions ?? null,
        notes: incoming.notes ?? remote.notes ?? null,
      };
    }
    return incoming;
  });

  // Keep remote versions omitted from a stale incoming payload.
  for (const remote of remoteVersions) {
    if (!incomingIds.has(remote.id)) merged.push(remote);
  }
  return merged;
}

/**
 * Merge incoming pattern_library write over the latest remote document so a
 * stale upsert cannot delete patterns or blank filled measurement sheets.
 */
export function protectPatternLibraryWrite(
  remote: ProtectablePatternLibrary,
  incoming: ProtectablePatternLibrary
): ProtectablePatternLibrary {
  const remotePatterns = Array.isArray(remote.client_patterns) ? remote.client_patterns : [];
  const incomingPatterns = Array.isArray(incoming.client_patterns)
    ? incoming.client_patterns
    : [];

  if (incomingPatterns.length === 0 && remotePatterns.length > 0) {
    throw new Error(
      `Refusing to wipe pattern_library (${remotePatterns.length} client patterns -> 0).`
    );
  }

  const remoteById = new Map(remotePatterns.map((pattern) => [pattern.id, pattern]));
  const incomingIds = new Set(incomingPatterns.map((pattern) => pattern.id));

  const mergedPatterns: ProtectableClientPattern[] = incomingPatterns.map((incomingPattern) => {
    const remotePattern = remoteById.get(incomingPattern.id);
    if (!remotePattern) return incomingPattern;
    return {
      ...incomingPattern,
      versions: mergeVersions(
        Array.isArray(remotePattern.versions) ? remotePattern.versions : [],
        Array.isArray(incomingPattern.versions) ? incomingPattern.versions : []
      ),
    };
  });

  for (const remotePattern of remotePatterns) {
    if (!incomingIds.has(remotePattern.id)) {
      mergedPatterns.push(remotePattern);
    }
  }

  return {
    ...remote,
    ...incoming,
    client_patterns: mergedPatterns,
  };
}
