import type { ClientPattern, ClientPatternVersion } from "@/lib/types/pattern-library";

/**
 * Strip measurement grids / marker boards from list payloads. Pattern library
 * and order board only need refs, trial counts, and light file metadata.
 */
export function slimClientPatternForList(pattern: ClientPattern): ClientPattern {
  return {
    ...pattern,
    marker_layout: null,
    versions: pattern.versions.map(slimVersionForList),
  };
}

function slimVersionForList(version: ClientPatternVersion): ClientPatternVersion {
  return {
    ...version,
    measurements: [],
  };
}

/** Summary row for order-board consolidate picker (no versions/files). */
export type ClientPatternListSummary = {
  id: string;
  pattern_ref: string;
  client_id: string;
  client_code: string;
  client_name: string;
  garment_type: string;
  unit: ClientPattern["unit"];
  base_size: string | null;
  base_pattern_id: string | null;
  final_version_id: string | null;
  linked_fabric_line_ids: string[];
  trial_count: number;
  updated_at: string | null;
};

export function toClientPatternListSummary(pattern: ClientPattern): ClientPatternListSummary {
  return {
    id: pattern.id,
    pattern_ref: pattern.pattern_ref,
    client_id: pattern.client_id,
    client_code: pattern.client_code,
    client_name: pattern.client_name,
    garment_type: pattern.garment_type,
    unit: pattern.unit,
    base_size: pattern.base_size ?? null,
    base_pattern_id: pattern.base_pattern_id ?? null,
    final_version_id: pattern.final_version_id ?? null,
    linked_fabric_line_ids: pattern.linked_fabric_line_ids ?? [],
    trial_count: pattern.versions.length,
    updated_at: pattern.updated_at ?? null,
  };
}
