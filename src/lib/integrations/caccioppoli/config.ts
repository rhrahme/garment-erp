/**
 * Caccioppoli CUSTOM API (GR Sistemi) — see reference-documents/Caccioppoli/
 * or supplier PDF "26C1101GD - Custom Api Service.pdf".
 *
 * Token: issued per client (e.g. RALPH RHAME row in api_tokens CSV from Caccioppoli).
 * Set CACCIOPPOLI_API_TOKEN in .env.local — never commit the token.
 */

export const CACCIOPPOLI_API_DISPLAY_NAME = "Caccioppoli API";

/** Supplier id in contacts.json and catalog JSON. */
export const CACCIOPPOLI_SUPPLIER_ID = "caccioppoli";

/** GR Sistemi client code path segment. */
export const CACCIOPPOLI_CLIENT_CODE = "caccioppoli";

export const CACCIOPPOLI_API_BASE_URL = (
  process.env.CACCIOPPOLI_API_BASE_URL?.trim() || "https://api-service.grsis.it"
).replace(/\/$/, "");

export function getCaccioppoliApiToken(): string | null {
  return process.env.CACCIOPPOLI_API_TOKEN?.trim() || null;
}

export function isCaccioppoliApiConfigured(): boolean {
  return Boolean(getCaccioppoliApiToken());
}

/** Default page size for POST /caccioppoli/getImages. */
export const CACCIOPPOLI_IMAGES_PAGE_SIZE = 25;
