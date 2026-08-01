/** Client-safe fabric price masking constants — no Node/server imports. */

export const FABRIC_PRICE_UNLOCK_COOKIE = "fabric_prices_unlocked";
/** Safety TTL; unlock is path-scoped and cleared on refresh / route change. */
export const FABRIC_PRICE_UNLOCK_MAX_AGE_SEC = 60 * 60 * 12;
export const MASKED_FABRIC_PRICE = "••••••";
export const MASKED_FABRIC_COST = "SAR ••••••";

/** @deprecated Unlock is in-memory; key kept so old sessionStorage entries are ignored. */
export const FABRIC_SPEC_PRICES_VISIBLE_SESSION_KEY = "fabric_spec_prices_visible";
