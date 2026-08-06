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
