/** Client-safe fabric price masking constants — no Node/server imports. */

export const FABRIC_PRICE_UNLOCK_COOKIE = "fabric_prices_unlocked";
export const FABRIC_PRICE_UNLOCK_MAX_AGE_SEC = 60 * 60 * 12;
export const MASKED_FABRIC_PRICE = "••••••";
export const MASKED_FABRIC_COST = "SAR ••••••";

/** Fabric catalog / price-list UI - admin eye toggle (sessionStorage). */
export const FABRIC_SPEC_PRICES_VISIBLE_SESSION_KEY = "fabric_spec_prices_visible";
