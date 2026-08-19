import type { ClientProfile } from "@/lib/types/clients";

export function normalizeNamePart(value: unknown): string {
  return String(value ?? "").trim();
}

/** Dropdown values shown before First on Clients / new-client create. */
export const CLIENT_TITLE_OPTIONS = [
  "Mr",
  "Mrs",
  "Ms",
  "Miss",
  "Dr",
  "Pr",
  "Sheikh",
  "Eng",
  "Prof",
] as const;

export type ClientTitle = (typeof CLIENT_TITLE_OPTIONS)[number];

const TITLE_BY_KEY = new Map<string, string>();
for (const title of CLIENT_TITLE_OPTIONS) {
  TITLE_BY_KEY.set(title.toLowerCase(), title);
}
TITLE_BY_KEY.set("prince", "Pr");
TITLE_BY_KEY.set("shaikh", "Sheikh");
TITLE_BY_KEY.set("hrh", "HRH");
TITLE_BY_KEY.set("hh", "HH");
TITLE_BY_KEY.set("he", "HE");
TITLE_BY_KEY.set("princess", "Princess");

export type ClientNameFields = Pick<ClientProfile, "title" | "first_name" | "middle_name" | "last_name">;

function firstNameToken(value: unknown): string {
  return normalizeNamePart(value).split(/\s+/).find(Boolean) ?? "";
}

function remainingNameTokens(value: unknown): string | null {
  const parts = normalizeNamePart(value).split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(" ") : null;
}

function titleLookupKey(value: string): string {
  return value.replace(/\.+$/, "").toLowerCase();
}

/** Canonical title (Pr, Sheikh, ...) or null when empty / unknown. */
export function normalizeClientTitle(value: unknown): string | null {
  const raw = normalizeNamePart(value);
  if (!raw) return null;
  return TITLE_BY_KEY.get(titleLookupKey(raw)) ?? null;
}

export function isClientNameTitle(value: unknown): boolean {
  return normalizeClientTitle(value) !== null;
}

/**
 * Split a title stored in first_name (legacy Pr Khaled Bin Salman) into
 * title + given name so the dropdown and first field stay separate.
 */
export function liftClientTitleFromNameParts(client: ClientNameFields): {
  title: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
} {
  const last_name = normalizeNamePart(client.last_name);
  let title = normalizeClientTitle(client.title);
  let first_name = normalizeNamePart(client.first_name);
  let middle_name = normalizeText(client.middle_name);

  if (isClientNameTitle(first_name)) {
    const given = firstNameToken(middle_name);
    if (given) {
      title = title ?? normalizeClientTitle(first_name);
      first_name = given;
      middle_name = remainingNameTokens(middle_name);
    }
  }

  return { title, first_name, middle_name, last_name };
}

export function formatClientDisplayName(client: ClientNameFields): string {
  const parts = liftClientTitleFromNameParts(client);
  return [parts.title, parts.first_name, parts.middle_name, parts.last_name].filter(Boolean).join(" ").trim();
}

/**
 * Floor / list short label. Usual recipe is first + last (drops middle).
 * With a title, use title + given name so Live shows "Pr Khaled" not "Pr Salman".
 */
export function formatClientShortName(client: ClientNameFields): string {
  const parts = liftClientTitleFromNameParts(client);
  if (parts.title && parts.first_name) {
    return `${parts.title} ${parts.first_name}`;
  }
  return [parts.first_name, parts.last_name].filter(Boolean).join(" ");
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

export function hasRequiredClientName(
  client: Pick<ClientProfile, "first_name" | "last_name"> & Partial<ClientNameFields>
): boolean {
  const lifted = liftClientTitleFromNameParts({
    title: client.title ?? null,
    first_name: client.first_name,
    middle_name: client.middle_name ?? null,
    last_name: client.last_name,
  });
  return Boolean(lifted.first_name && lifted.last_name);
}

export function isClientSaveable(client: Pick<ClientProfile, "first_name" | "last_name" | "brand_ids">): boolean {
  return hasRequiredClientName(client) && client.brand_ids.length > 0;
}

/** Empty row from "Add client" — safe to drop before persisting. */
export function isBlankClientPlaceholder(
  client: Pick<ClientProfile, "first_name" | "last_name" | "brand_ids" | "code" | "email" | "phone">
): boolean {
  return (
    !hasRequiredClientName(client) &&
    client.brand_ids.length === 0 &&
    !client.code &&
    !client.email &&
    !client.phone
  );
}

/** Map legacy single `name` field to title/first/last when loading old records */
export function migrateClientName(raw: Record<string, unknown>): {
  title: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
} {
  const first_name = normalizeNamePart(raw.first_name);
  const middle_name = normalizeText(raw.middle_name);
  const last_name = normalizeNamePart(raw.last_name);

  if (first_name || last_name) {
    return liftClientTitleFromNameParts({
      title: raw.title as string | null | undefined,
      first_name,
      middle_name,
      last_name,
    });
  }

  const legacyName = normalizeNamePart(raw.name);
  if (!legacyName) {
    return { title: normalizeClientTitle(raw.title), first_name: "", middle_name: null, last_name: "" };
  }

  const parts = legacyName.split(/\s+/);
  if (parts.length === 1) {
    return liftClientTitleFromNameParts({
      title: raw.title as string | null | undefined,
      first_name: parts[0],
      middle_name: null,
      last_name: "",
    });
  }

  return liftClientTitleFromNameParts({
    title: raw.title as string | null | undefined,
    first_name: parts[0],
    middle_name: parts.length > 2 ? parts.slice(1, -1).join(" ") : null,
    last_name: parts[parts.length - 1],
  });
}

function normalizeText(value: unknown): string | null {
  const trimmed = normalizeNamePart(value);
  return trimmed.length > 0 ? trimmed : null;
}
