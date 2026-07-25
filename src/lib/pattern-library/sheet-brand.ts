import { BRAND_CLIENT_CODE_PREFIX, parseClientCodeParts } from "@/lib/clients/codes";
import type { BasePattern, ClientPattern } from "@/lib/types/pattern-library";

export interface SheetHouseBrand {
  /** Short letterhead code — FR, GL, FD, … */
  code: string | null;
  /** Factory brand display name — "Fouad Rahme", … */
  name: string | null;
}

/** Display names for letterhead (mirrors factory-brands.json). */
const BRAND_DISPLAY_NAME: Record<string, string> = {
  "fouad-rahme": "Fouad Rahme",
  fouad: "Fouad",
  gliani: "Gliani",
  "just-uniforms": "Just Uniforms",
};

function brandIdForClientCodePrefix(prefix: string): string | null {
  const upper = prefix.trim().toUpperCase();
  for (const [brandId, codePrefix] of Object.entries(BRAND_CLIENT_CODE_PREFIX)) {
    if (codePrefix === upper) return brandId;
  }
  return null;
}

/**
 * Resolves the A4 letterhead house brand. Prefer the pattern/base fields; when
 * those were never set (pattern created without a base), fall back to the
 * client-code prefix (FR-0626-0035 → FR / Fouad Rahme).
 */
export function resolveSheetHouseBrand(
  pattern: Pick<ClientPattern, "house_brand_code" | "house_brand_id" | "client_code">,
  base: Pick<BasePattern, "house_brand_code" | "house_brand_id"> | null
): SheetHouseBrand {
  const fromClient = parseClientCodeParts(pattern.client_code ?? "");
  const code =
    pattern.house_brand_code?.trim() ||
    base?.house_brand_code?.trim() ||
    fromClient?.prefix ||
    null;

  const brandId =
    pattern.house_brand_id?.trim() ||
    base?.house_brand_id?.trim() ||
    (code ? brandIdForClientCodePrefix(code) : null) ||
    null;

  return {
    code: code ? code.toUpperCase() : null,
    name: brandId ? BRAND_DISPLAY_NAME[brandId] ?? null : null,
  };
}
