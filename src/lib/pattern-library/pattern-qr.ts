import { generatePatternRef } from "@/lib/pattern-library/refs";
import type { BasePattern, ClientPattern } from "@/lib/types/pattern-library";

/**
 * Fixed QR per pattern — the QR payload is a deep link built from the pattern's
 * immutable id, so the code printed on the physical archived pattern never
 * changes no matter how the grid, family, or naming is edited later. Scanning
 * with any phone camera opens the pattern's page in the ERP (same approach as
 * workstation QRs — see workstationScanUrl).
 */

function appUrl(baseUrl?: string): string {
  return ((baseUrl ?? process.env.NEXT_PUBLIC_APP_URL?.trim()) || "https://erp.hagan.pro").replace(
    /\/$/,
    ""
  );
}

export function basePatternPath(baseId: string): string {
  return `/pattern/library/bases/${encodeURIComponent(baseId)}`;
}

export function clientPatternPath(patternId: string): string {
  return `/pattern/library/clients/${encodeURIComponent(patternId)}`;
}

/** Permanent deep link encoded in a base pattern's QR. */
export function basePatternQrUrl(baseId: string, baseUrl?: string): string {
  return `${appUrl(baseUrl)}${basePatternPath(baseId)}`;
}

/** Permanent deep link encoded in a client pattern's QR. */
export function clientPatternQrUrl(patternId: string, baseUrl?: string): string {
  return `${appUrl(baseUrl)}${clientPatternPath(patternId)}`;
}

/**
 * Human-readable label printed under the QR (e.g. PAT-SS-JACKET-FR-REG).
 * Display only — the scanned payload uses the immutable id, so relabeling
 * after an edit never breaks previously printed QRs.
 */
export function basePatternLabelCode(
  base: Pick<BasePattern, "cut_family" | "garment_type" | "house_brand_code" | "cut_variant">
): string {
  const ref = generatePatternRef({
    cut_family: base.cut_family,
    garment_type: base.garment_type,
    house_brand_code: base.house_brand_code,
    cut_variant: base.cut_variant,
  });
  return ref ? `PAT-${ref}` : "PAT";
}

/** Client patterns already carry a team ref — reuse it as the QR label. */
export function clientPatternLabelCode(pattern: Pick<ClientPattern, "pattern_ref">): string {
  return pattern.pattern_ref;
}
