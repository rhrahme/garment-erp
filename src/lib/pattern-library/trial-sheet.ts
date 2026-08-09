import type {
  ClientPattern,
  ClientPatternMeasurement,
  ClientPatternVersion,
} from "@/lib/types/pattern-library";

export type TrialSheetColumnKind = "sample" | "trial" | "final";

export interface TrialSheetColumn {
  key: string;
  kind: TrialSheetColumnKind;
  label: string;
  versionId: string | null;
  versionNumber: number | null;
  isCurrent: boolean;
}

export interface TrialSheetPoint {
  point_id: string;
  name: string;
  remark: string | null;
}

/** Latest non-final trial, or the final version when the sheet is finalized. */
export function currentTrialVersion(pattern: ClientPattern): ClientPatternVersion | null {
  if (pattern.final_version_id) {
    return pattern.versions.find((v) => v.id === pattern.final_version_id) ?? null;
  }
  return pattern.versions[pattern.versions.length - 1] ?? null;
}

export function trialSheetStatusLabel(pattern: ClientPattern): string {
  if (pattern.final_version_id) {
    const finalVersion = pattern.versions.find((v) => v.id === pattern.final_version_id);
    return finalVersion ? `Final (Trial ${finalVersion.version})` : "Final";
  }
  const current = currentTrialVersion(pattern);
  if (!current) return "No trials";
  return `Current: Trial ${current.version}`;
}

/**
 * Columns: Sample | Trial 1 | Trial 2 | ... | Final.
 * Final mirrors the finalized trial (or stays empty until Mark as final).
 */
export function buildTrialSheetColumns(pattern: ClientPattern): TrialSheetColumn[] {
  const current = currentTrialVersion(pattern);
  const columns: TrialSheetColumn[] = [
    {
      key: "sample",
      kind: "sample",
      label: "Sample",
      versionId: null,
      versionNumber: null,
      isCurrent: false,
    },
  ];

  for (const version of pattern.versions) {
    columns.push({
      key: `trial:${version.id}`,
      kind: "trial",
      label: `Trial ${version.version}`,
      versionId: version.id,
      versionNumber: version.version,
      isCurrent: !pattern.final_version_id && current?.id === version.id,
    });
  }

  const finalVersion = pattern.final_version_id
    ? pattern.versions.find((v) => v.id === pattern.final_version_id) ?? null
    : null;
  columns.push({
    key: finalVersion ? `final:${finalVersion.id}` : "final:pending",
    kind: "final",
    label: "Final",
    versionId: finalVersion?.id ?? null,
    versionNumber: finalVersion?.version ?? null,
    isCurrent: Boolean(finalVersion),
  });

  return columns;
}

/** Union of measurement points across all trials (first-trial order). */
export function trialSheetPoints(pattern: ClientPattern): TrialSheetPoint[] {
  const points: TrialSheetPoint[] = [];
  const seen = new Set<string>();
  for (const version of pattern.versions) {
    for (const row of version.measurements) {
      if (seen.has(row.point_id)) continue;
      seen.add(row.point_id);
      points.push({
        point_id: row.point_id,
        name: row.name,
        remark: row.remark,
      });
    }
  }
  return points;
}

export function sampleValueForPoint(
  pattern: ClientPattern,
  pointId: string
): number | null {
  for (const version of pattern.versions) {
    const row = version.measurements.find((m) => m.point_id === pointId);
    if (row && row.base_value !== null) return row.base_value;
  }
  return null;
}

export function trialColumnValue(
  version: ClientPatternVersion | null,
  pointId: string
): number | null {
  if (!version) return null;
  const row = version.measurements.find((m) => m.point_id === pointId);
  if (!row) return null;
  return row.target_value ?? row.sewn_value ?? null;
}

export function findMeasurementRow(
  version: ClientPatternVersion,
  pointId: string
): ClientPatternMeasurement | null {
  return version.measurements.find((m) => m.point_id === pointId) ?? null;
}

/** Prefer current/final trial remarks, then any version that has one. */
export function remarksForPoint(
  pattern: ClientPattern,
  pointId: string
): string | null {
  const preferred =
    currentTrialVersion(pattern) ??
    pattern.versions.find((version) => version.is_final) ??
    pattern.versions[0] ??
    null;
  if (preferred) {
    const row = findMeasurementRow(preferred, pointId);
    if (row?.remarks?.trim()) return row.remarks.trim();
  }
  for (const version of pattern.versions) {
    const row = findMeasurementRow(version, pointId);
    if (row?.remarks?.trim()) return row.remarks.trim();
  }
  return null;
}

export function slugifyPointId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "point";
}

export function emptyClientMeasurement(
  pointId: string,
  name: string,
  remark: string | null = null
): ClientPatternMeasurement {
  return {
    point_id: pointId,
    name,
    remark,
    is_graded: true,
    base_value: null,
    target_value: null,
    sewn_value: null,
    adjustment: null,
    remarks: null,
  };
}

/** Pattern owns the sheet: add the same point on every trial. */
export function addPointToAllVersions(
  pattern: ClientPattern,
  name: string
): ClientPattern | null {
  const trimmed = name.trim();
  if (!trimmed || pattern.versions.length === 0) return null;
  const pointId = slugifyPointId(trimmed);
  if (trialSheetPoints(pattern).some((point) => point.point_id === pointId)) {
    return null;
  }
  const row = emptyClientMeasurement(pointId, trimmed);
  return {
    ...pattern,
    versions: pattern.versions.map((version) => ({
      ...version,
      measurements: [...version.measurements, { ...row }],
    })),
  };
}

/** Pattern owns the sheet: remove the point from every trial. */
export function removePointFromAllVersions(
  pattern: ClientPattern,
  pointId: string
): ClientPattern {
  return {
    ...pattern,
    versions: pattern.versions.map((version) => ({
      ...version,
      measurements: version.measurements.filter((row) => row.point_id !== pointId),
    })),
  };
}

/** Rename keeps point_id stable so load-from-base / evolution still match. */
export function renamePointOnAllVersions(
  pattern: ClientPattern,
  pointId: string,
  name: string
): ClientPattern {
  // Reject blank names; keep trailing spaces while typing so the cursor stays put.
  if (!name.trim()) return pattern;
  return {
    ...pattern,
    versions: pattern.versions.map((version) => ({
      ...version,
      measurements: version.measurements.map((row) =>
        row.point_id === pointId ? { ...row, name } : row
      ),
    })),
  };
}

/** Apply a point_id order to every trial's measurement rows. */
export function applyPointOrderOnAllVersions(
  pattern: ClientPattern,
  order: string[]
): ClientPattern {
  return {
    ...pattern,
    versions: pattern.versions.map((version) => {
      const byId = new Map(version.measurements.map((row) => [row.point_id, row]));
      const reordered: ClientPatternMeasurement[] = [];
      for (const id of order) {
        const row = byId.get(id);
        if (row) {
          reordered.push(row);
          byId.delete(id);
        }
      }
      for (const row of byId.values()) reordered.push(row);
      return { ...version, measurements: reordered };
    }),
  };
}

/**
 * Reorder rows the same way on every trial (Sample/Trials/Final grid order).
 * Pass `subsetOrder` when the UI shows one set-garment piece only - swaps
 * within that piece and keeps other pieces' positions in the full sheet.
 */
export function movePointOnAllVersions(
  pattern: ClientPattern,
  pointId: string,
  direction: -1 | 1,
  subsetOrder?: string[]
): ClientPattern {
  const fullOrder = trialSheetPoints(pattern).map((point) => point.point_id);
  if (!subsetOrder?.length) {
    const index = fullOrder.findIndex((id) => id === pointId);
    if (index < 0) return pattern;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= fullOrder.length) return pattern;
    const order = [...fullOrder];
    const swap = order[index]!;
    order[index] = order[nextIndex]!;
    order[nextIndex] = swap;
    return applyPointOrderOnAllVersions(pattern, order);
  }

  const subset = [...subsetOrder];
  const index = subset.findIndex((id) => id === pointId);
  if (index < 0) return pattern;
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= subset.length) return pattern;
  const swap = subset[index]!;
  subset[index] = subset[nextIndex]!;
  subset[nextIndex] = swap;

  const subsetSet = new Set(subset);
  let cursor = 0;
  const merged = fullOrder.map((id) => {
    if (!subsetSet.has(id)) return id;
    return subset[cursor++]!;
  });
  return applyPointOrderOnAllVersions(pattern, merged);
}

function withEnsuredRow(
  measurements: ClientPatternMeasurement[],
  pointId: string,
  nameHint: string,
  remarkHint: string | null
): ClientPatternMeasurement[] {
  if (measurements.some((row) => row.point_id === pointId)) return measurements;
  return [...measurements, emptyClientMeasurement(pointId, nameHint, remarkHint)];
}

/** Patch a point on every trial, creating the row when missing. */
export function patchPointOnAllVersions(
  pattern: ClientPattern,
  pointId: string,
  patch: Partial<ClientPatternMeasurement>,
  hints?: { name?: string; remark?: string | null }
): ClientPattern {
  const nameHint =
    hints?.name ??
    trialSheetPoints(pattern).find((point) => point.point_id === pointId)?.name ??
    pointId;
  const remarkHint =
    hints?.remark ??
    trialSheetPoints(pattern).find((point) => point.point_id === pointId)?.remark ??
    null;
  return {
    ...pattern,
    versions: pattern.versions.map((version) => ({
      ...version,
      measurements: withEnsuredRow(
        version.measurements,
        pointId,
        nameHint,
        remarkHint
      ).map((row) => (row.point_id === pointId ? { ...row, ...patch } : row)),
    })),
  };
}

/** Patch a point on one trial, creating the row when missing. */
export function patchPointOnVersion(
  pattern: ClientPattern,
  versionId: string,
  pointId: string,
  patch: Partial<ClientPatternMeasurement>,
  hints?: { name?: string; remark?: string | null }
): ClientPattern {
  const nameHint =
    hints?.name ??
    trialSheetPoints(pattern).find((point) => point.point_id === pointId)?.name ??
    pointId;
  const remarkHint =
    hints?.remark ??
    trialSheetPoints(pattern).find((point) => point.point_id === pointId)?.remark ??
    null;
  return {
    ...pattern,
    versions: pattern.versions.map((version) => {
      if (version.id !== versionId) return version;
      return {
        ...version,
        measurements: withEnsuredRow(
          version.measurements,
          pointId,
          nameHint,
          remarkHint
        ).map((row) => (row.point_id === pointId ? { ...row, ...patch } : row)),
      };
    }),
  };
}
