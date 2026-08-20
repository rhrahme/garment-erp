import { generateNextClientCode, getBrandClientCodePrefix } from "@/lib/clients/codes";
import {
  formatClientDisplayName,
  hasRequiredClientName,
  migrateClientName,
  migrateReferredByName,
} from "@/lib/clients/names";
import { readClients, slugifyClientId, writeClients } from "@/lib/data/clients";
import { getFactoryBrandById } from "@/lib/data/factory-brands";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { notifyIntegration } from "@/lib/integrations";
import { normalizeStoredPhone } from "@/lib/phone/countries";
import type { ClientProfile } from "@/lib/types/clients";

export type CreateClientInput = {
  title?: unknown;
  first_name?: unknown;
  middle_name?: unknown;
  last_name?: unknown;
  name?: unknown;
  brand_ids?: unknown;
  contact_person?: unknown;
  referred_by_first_name?: unknown;
  referred_by_middle_name?: unknown;
  referred_by_last_name?: unknown;
  email?: unknown;
  phone?: unknown;
  country?: unknown;
  city?: unknown;
  address?: unknown;
  payment_terms?: unknown;
  notes?: unknown;
  is_active?: unknown;
};

function normalizeText(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export { resolveBrandIdsForNewClient } from "@/lib/clients/new-client-brand";

export function buildNewClientId(displayName: string, existingIds: Iterable<string>): string {
  const taken = new Set(existingIds);
  const base = slugifyClientId(displayName) || `client-${Date.now()}`;
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function buildNewClientProfile(
  input: CreateClientInput,
  existingClients: ClientProfile[],
  options: { allowContactFields: boolean; allowedBrandIds?: string[] | null } = {
    allowContactFields: true,
  }
): { ok: true; client: ClientProfile } | { ok: false; error: string; status: number } {
  const names = migrateClientName({
    title: input.title,
    first_name: input.first_name,
    middle_name: input.middle_name,
    last_name: input.last_name ?? input.name,
    name: input.name,
  });

  if (!hasRequiredClientName(names)) {
    return { ok: false, error: "First and last name are both required.", status: 400 };
  }

  const brand_ids = Array.isArray(input.brand_ids)
    ? [...new Set(input.brand_ids.map(String).filter(Boolean))]
    : [];
  if (brand_ids.length === 0) {
    return { ok: false, error: "Each client needs at least one production brand.", status: 400 };
  }

  for (const brandId of brand_ids) {
    if (!getFactoryBrandById(brandId)) {
      return { ok: false, error: `Unknown brand: ${brandId}`, status: 400 };
    }
  }

  const allowedBrandIds = options.allowedBrandIds;
  if (allowedBrandIds && brand_ids.some((brandId) => !allowedBrandIds.includes(brandId))) {
    return { ok: false, error: "That brand is outside your sales scope.", status: 403 };
  }

  const primaryBrandId = brand_ids[0];
  if (!getBrandClientCodePrefix(primaryBrandId)) {
    return { ok: false, error: `No client code prefix for brand: ${primaryBrandId}`, status: 400 };
  }

  const joined_at = new Date().toISOString();
  const code = generateNextClientCode(existingClients, primaryBrandId, {
    joinedAt: new Date(joined_at),
  });
  if (!code) {
    return { ok: false, error: "Could not assign a client code.", status: 400 };
  }
  if (existingClients.some((client) => client.code === code)) {
    return { ok: false, error: `Client code already exists: ${code}`, status: 400 };
  }

  const allowContactFields = options.allowContactFields !== false;
  const referredBy = allowContactFields
    ? migrateReferredByName(input as Record<string, unknown>)
    : {
        referred_by_first_name: null,
        referred_by_middle_name: null,
        referred_by_last_name: null,
      };

  const displayName = formatClientDisplayName(names);
  const client: ClientProfile = {
    id: buildNewClientId(
      displayName,
      existingClients.map((row) => row.id)
    ),
    code,
    joined_at,
    title: names.title,
    first_name: names.first_name,
    middle_name: names.middle_name,
    last_name: names.last_name,
    brand_ids,
    contact_person: allowContactFields ? normalizeText(input.contact_person) : null,
    referred_by_first_name: referredBy.referred_by_first_name,
    referred_by_middle_name: referredBy.referred_by_middle_name,
    referred_by_last_name: referredBy.referred_by_last_name,
    email: allowContactFields ? normalizeText(input.email) : null,
    phone: allowContactFields ? normalizeStoredPhone(input.phone) : null,
    country: allowContactFields ? normalizeText(input.country) : null,
    city: normalizeText(input.city),
    address: normalizeText(input.address),
    payment_terms: normalizeText(input.payment_terms),
    client_reference_prefix: null,
    notes: normalizeText(input.notes),
    is_active: input.is_active !== false,
    client_kind: "person",
  };

  return { ok: true, client };
}

export async function createAndPersistClient(
  input: CreateClientInput,
  options: {
    allowContactFields: boolean;
    allowedBrandIds?: string[] | null;
    source?: "erp" | "api";
  }
): Promise<
  | { ok: true; client: ClientProfile; updated_at: string | null }
  | { ok: false; error: string; status: number }
> {
  await ensureDocumentsLoaded(["clients", "sales_orders"]);
  const store = readClients();
  const built = buildNewClientProfile(input, store.clients, {
    allowContactFields: options.allowContactFields,
    allowedBrandIds: options.allowedBrandIds,
  });
  if (!built.ok) return built;

  store.clients.push(built.client);
  const saved = await writeClients(store);
  const source = options.source ?? "erp";

  for (const restored of saved.restored) {
    await notifyIntegration(
      "client.created",
      {
        id: restored.id,
        code: restored.code,
        title: restored.title ?? null,
        first_name: restored.first_name,
        middle_name: restored.middle_name,
        last_name: restored.last_name,
        brand_ids: restored.brand_ids,
        restored_from: "orphan_reconciliation",
      },
      source
    );
  }

  await notifyIntegration(
    "client.created",
    {
      id: built.client.id,
      code: built.client.code,
      title: built.client.title ?? null,
      first_name: built.client.first_name,
      middle_name: built.client.middle_name,
      last_name: built.client.last_name,
      brand_ids: built.client.brand_ids,
    },
    source
  );

  return { ok: true, client: built.client, updated_at: saved.updated_at };
}
