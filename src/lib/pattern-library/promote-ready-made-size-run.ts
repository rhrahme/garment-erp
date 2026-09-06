import type {
  BasePatternPoint,
  ClientPattern,
} from "@/lib/types/pattern-library";

export const BOGGI_OVERCOAT_SPEC_FILENAME = "Boggi Measurement Spec for Overcoat.xlsx";

export function stockSizeFromFabric(fabric: string | null | undefined): string | null {
  const raw = (fabric ?? "").trim();
  const match = raw.match(/^(?:stock[-\s]*)?(\d{2,3})$/i);
  return match?.[1] ?? null;
}

export function boggiOvercoatPatternRef(size: string): string {
  return `Boggi Overcoat ${size.trim()}`;
}

export function pickBestSizeRunSheet(
  patterns: ClientPattern[],
  size: string
): ClientPattern | null {
  const matches = patterns.filter(
    (pattern) => stockSizeFromFabric(pattern.fabric) === size
  );
  if (matches.length === 0) return null;
  return [...matches].sort((left, right) => {
    const leftFilled = countFilledTargets(left);
    const rightFilled = countFilledTargets(right);
    if (rightFilled !== leftFilled) return rightFilled - leftFilled;
    const leftLinked = left.linked_fabric_line_ids?.length ?? 0;
    const rightLinked = right.linked_fabric_line_ids?.length ?? 0;
    if (rightLinked !== leftLinked) return rightLinked - leftLinked;
    return (right.updated_at ?? "").localeCompare(left.updated_at ?? "");
  })[0]!;
}

function latestVersion(pattern: ClientPattern) {
  return pattern.versions[0] ?? null;
}

function countFilledTargets(pattern: ClientPattern): number {
  const version = latestVersion(pattern);
  if (!version) return 0;
  return version.measurements.filter((row) => row.target_value != null || row.base_value != null)
    .length;
}

export function buildBasePointsFromSizeRun(
  patterns: ClientPattern[],
  sizes: string[]
): BasePatternPoint[] {
  const bySize = new Map<string, ClientPattern>();
  for (const size of sizes) {
    const sheet = pickBestSizeRunSheet(patterns, size);
    if (sheet) bySize.set(size, sheet);
  }

  const pointOrder: Array<{ point_id: string; name: string; remark: string | null }> = [];
  const seen = new Set<string>();
  for (const size of sizes) {
    const version = latestVersion(bySize.get(size) ?? patterns[0]!);
    if (!version) continue;
    for (const row of version.measurements) {
      const pointId = row.point_id.trim();
      if (!pointId || seen.has(pointId)) continue;
      seen.add(pointId);
      pointOrder.push({
        point_id: pointId,
        name: row.name.trim(),
        remark: row.remark ?? null,
      });
    }
  }

  return pointOrder.map((point) => {
    const values: Record<string, number | null> = {};
    for (const size of sizes) {
      const sheet = bySize.get(size);
      const version = sheet ? latestVersion(sheet) : null;
      const row = version?.measurements.find((item) => item.point_id === point.point_id);
      const value = row?.target_value ?? row?.base_value ?? null;
      values[size] = typeof value === "number" && Number.isFinite(value) ? value : null;
    }
    return {
      point_id: point.point_id,
      name: point.name,
      remark: point.remark,
      is_graded: true,
      tolerance: null,
      grading_increment: null,
      diagram_code: null,
      values,
    };
  });
}

export function readyMadeSizeRunClientPatterns(
  patterns: ClientPattern[],
  clientId = "boggi-overcoat"
): ClientPattern[] {
  return patterns.filter((pattern) => pattern.client_id === clientId);
}
