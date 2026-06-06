/** Official Drapers REST API — see reference-documents/Drapers/DrapersAPI_DocumentationEN-202601.pdf */

/** Shown in the ERP UI instead of the API key profile name from /helloworld/. */
export const DRAPERS_API_DISPLAY_NAME = "Drapers API";

/** Supplier id in local catalog / fabric-spec (contacts.json). */
export const DRAPERS_SUPPLIER_ID = "drapers";

export const DRAPERS_API_BASE_URL = (
  process.env.DRAPERS_API_BASE_URL?.trim() || "https://api.drapersitaly.it"
).replace(/\/$/, "");

export function getDrapersApiKey(): string | null {
  return process.env.DRAPERS_API_KEY?.trim() || null;
}

export function isDrapersApiConfigured(): boolean {
  return Boolean(getDrapersApiKey());
}

/** Max items per page per Drapers API docs. */
export const DRAPERS_API_PAGE_LIMIT = 25;
