import { formatClientDisplayName, hasRequiredClientName, normalizeNamePart } from "@/lib/clients/names";
import type { ClientProfile } from "@/lib/types/clients";

export type ClientNameParts = Pick<ClientProfile, "first_name" | "middle_name" | "last_name">;

function normalizeMiddle(value: string | null | undefined): string | null {
  const trimmed = normalizeNamePart(value);
  return trimmed.length > 0 ? trimmed : null;
}

/** True when first / middle / last match after trim (empty middle ≡ null). */
export function clientNamesEqual(a: ClientNameParts, b: ClientNameParts): boolean {
  return (
    normalizeNamePart(a.first_name) === normalizeNamePart(b.first_name) &&
    normalizeMiddle(a.middle_name) === normalizeMiddle(b.middle_name) &&
    normalizeNamePart(a.last_name) === normalizeNamePart(b.last_name)
  );
}

/**
 * Existing clients with a required name are rename-locked for non-admins.
 * New clients (no previous row) and incomplete prior rows may still set a name.
 */
export function isClientNameLocked(previous: ClientNameParts | null | undefined): boolean {
  return Boolean(previous && hasRequiredClientName(previous));
}

/**
 * Returns an error message when a non-admin tries to rename a locked client; otherwise null.
 */
export function assertClientRenameAllowed(
  isAdmin: boolean,
  previous: ClientNameParts | null | undefined,
  next: ClientNameParts
): string | null {
  if (isAdmin || !isClientNameLocked(previous) || !previous) return null;
  if (clientNamesEqual(previous, next)) return null;
  const label = formatClientDisplayName(previous) || "this client";
  return `Only admins can rename an existing client (${label}).`;
}

/**
 * Returns an error when a non-admin omits existing clients from a bulk save (implicit delete).
 */
export function assertClientDeleteAllowed(
  isAdmin: boolean,
  previousClients: Array<Pick<ClientProfile, "id" | "code"> & ClientNameParts>,
  nextClients: Array<Pick<ClientProfile, "id">>
): string | null {
  if (isAdmin) return null;
  const nextIds = new Set(nextClients.map((client) => client.id));
  const omitted = previousClients.find((client) => !nextIds.has(client.id));
  if (!omitted) return null;
  const label = formatClientDisplayName(omitted) || omitted.code || omitted.id;
  return `Only admins can delete clients (${label}).`;
}
