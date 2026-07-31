import type { PatternSheetData } from "@/lib/pattern-library/sheet-data";

/** Collapse to filesystem-safe ASCII slug tokens. */
export function slugPdfToken(value: string | null | undefined, maxLen = 40): string {
  const raw = (value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/['"]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  if (!raw) return "";
  return raw.slice(0, maxLen).replace(/-+$/g, "");
}

function sheetStageLabel(version: PatternSheetData["version"]): string {
  if (version.is_final) return "Final";
  if (version.version <= 1) return "Sample";
  return `Trial-${version.version}`;
}

/**
 * Smart download name for a client pattern measurement PDF.
 * Example: FR-0526-0002-Youssef-Al-Rashed-shorts-S10008-SO-2026-0002-Sample.pdf
 */
export function buildPatternSheetPdfFilename(data: PatternSheetData): string {
  const clientCode = slugPdfToken(data.pattern.client_code, 24);
  const clientName = slugPdfToken(data.pattern.client_name, 36);
  const garment = slugPdfToken(data.pattern.garment_type, 28);
  const hasIdentity = Boolean(clientCode || clientName || garment);

  const parts = [
    clientCode,
    clientName,
    garment,
    slugPdfToken(data.resolved_base_size ?? data.pattern.base_size, 12),
    slugPdfToken(data.fabric?.fabric_number ?? data.job?.fabric_number ?? null, 16),
    slugPdfToken(data.order?.so_number ?? data.job?.so_number ?? null, 20),
    // Fall back to pattern_ref when client/garment identity is missing.
    hasIdentity ? "" : slugPdfToken(data.pattern.pattern_ref, 48),
    slugPdfToken(sheetStageLabel(data.version), 16),
  ].filter(Boolean);

  const base = parts.join("-") || slugPdfToken(data.pattern.pattern_ref, 48) || "pattern-sheet";
  // Keep Windows/mac path lengths sane.
  const trimmed = base.length > 140 ? base.slice(0, 140).replace(/-+$/g, "") : base;
  return `${trimmed}.pdf`;
}
