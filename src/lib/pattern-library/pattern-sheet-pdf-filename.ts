import type { PatternSheetData } from "@/lib/pattern-library/sheet-data";
import {
  patternSheetKindLabel,
  type PatternSheetKind,
} from "@/lib/pattern-library/pattern-sheet-kind";
import { buildDownloadFilename, slugPdfToken } from "@/lib/pdf/download-filename";

export { slugPdfToken } from "@/lib/pdf/download-filename";

function sheetStageLabel(version: PatternSheetData["version"]): string {
  if (version.is_final) return "Final";
  if (version.version <= 1) return "Sample";
  return `Trial-${version.version}`;
}

/**
 * Smart download name for a client pattern sheet PDF.
 * Example: FR-0526-0002-Youssef-Al-Rashed-shorts-S10008-SO-2026-0002-Sample-Cutter.pdf
 */
export function buildPatternSheetPdfFilename(
  data: PatternSheetData,
  kind: PatternSheetKind = "cutter"
): string {
  const clientCode = slugPdfToken(data.pattern.client_code, 24);
  const clientName = slugPdfToken(data.pattern.client_name, 36);
  const garment = slugPdfToken(data.pattern.garment_type, 28);
  const hasIdentity = Boolean(clientCode || clientName || garment);

  return buildDownloadFilename([
    clientCode,
    clientName,
    garment,
    data.resolved_base_size ?? data.pattern.base_size,
    data.fabric?.fabric_number ?? data.job?.fabric_number ?? null,
    data.order?.so_number ?? data.job?.so_number ?? null,
    // Fall back to pattern_ref when client/garment identity is missing.
    hasIdentity ? null : data.pattern.pattern_ref,
    sheetStageLabel(data.version),
    patternSheetKindLabel(kind),
  ]);
}
