import type { ClientProfile } from "@/lib/types/clients";

export function normalizeNamePart(value: unknown): string {
  return String(value ?? "").trim();
}

export function formatClientDisplayName(client: Pick<ClientProfile, "first_name" | "middle_name" | "last_name">): string {
  return [client.first_name, client.middle_name, client.last_name].filter(Boolean).join(" ").trim();
}

export function formatReferredByName(
  client: Pick<ClientProfile, "referred_by_first_name" | "referred_by_middle_name" | "referred_by_last_name">
): string {
  return [client.referred_by_first_name, client.referred_by_middle_name, client.referred_by_last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function migrateReferredByName(
  raw: Record<string, unknown>
): Pick<ClientProfile, "referred_by_first_name" | "referred_by_middle_name" | "referred_by_last_name"> {
  return {
    referred_by_first_name: normalizeText(raw.referred_by_first_name),
    referred_by_middle_name: normalizeText(raw.referred_by_middle_name),
    referred_by_last_name: normalizeText(raw.referred_by_last_name),
  };
}

export function hasRequiredClientName(client: Pick<ClientProfile, "first_name" | "last_name">): boolean {
  return Boolean(normalizeNamePart(client.first_name) && normalizeNamePart(client.last_name));
}

export function isClientSaveable(client: Pick<ClientProfile, "first_name" | "last_name" | "brand_ids">): boolean {
  return hasRequiredClientName(client) && client.brand_ids.length > 0;
}

/** Map legacy single `name` field to first/last when loading old records */
export function migrateClientName(raw: Record<string, unknown>): Pick<ClientProfile, "first_name" | "middle_name" | "last_name"> {
  const first_name = normalizeNamePart(raw.first_name);
  const middle_name = normalizeText(raw.middle_name);
  const last_name = normalizeNamePart(raw.last_name);

  if (first_name || last_name) {
    return { first_name, middle_name, last_name };
  }

  const legacyName = normalizeNamePart(raw.name);
  if (!legacyName) {
    return { first_name: "", middle_name: null, last_name: "" };
  }

  const parts = legacyName.split(/\s+/);
  if (parts.length === 1) {
    return { first_name: parts[0], middle_name: null, last_name: "" };
  }

  return {
    first_name: parts[0],
    middle_name: parts.length > 2 ? parts.slice(1, -1).join(" ") : null,
    last_name: parts[parts.length - 1],
  };
}

function normalizeText(value: unknown): string | null {
  const trimmed = normalizeNamePart(value);
  return trimmed.length > 0 ? trimmed : null;
}
