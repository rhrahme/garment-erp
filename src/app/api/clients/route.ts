import { NextResponse } from "next/server";
import { redactClientsFile } from "@/lib/auth/client-contact-access";
import { requireAuthenticated } from "@/lib/auth/session";
import { generateNextClientCode, getBrandClientCodePrefix } from "@/lib/clients/codes";
import { formatClientDisplayName, formatReferredByName, hasRequiredClientName, migrateClientName, migrateReferredByName, normalizeNamePart } from "@/lib/clients/names";
import { normalizeStoredPhone } from "@/lib/phone/countries";
import {
  ensureOrphanedClientsReconciled,
  normalizeClientCode,
  protectLinkedClientsOnSave,
  readClients,
  slugifyClientId,
  writeClients,
} from "@/lib/data/clients";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getFactoryBrandById } from "@/lib/data/factory-brands";
import { notifyIntegration } from "@/lib/integrations";
import type { ClientProfile } from "@/lib/types/clients";

function normalizeText(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateClients(
  body: unknown,
  previousClients: ClientProfile[] = [],
  options: { allowContactFields?: boolean } = {}
): { ok: true; data: ClientProfile[] } | { ok: false; error: string } {
  const allowContactFields = options.allowContactFields !== false;
  if (!body || typeof body !== "object" || !Array.isArray((body as { clients?: unknown }).clients)) {
    return { ok: false, error: "clients array is required." };
  }

  const input = (body as { clients: Record<string, unknown>[] }).clients;
  const previousById = new Map(previousClients.map((client) => [client.id, client]));
  const seenIds = new Set<string>();
  const seenCodes = new Set<string>();
  const clients: ClientProfile[] = [];

  for (const row of input) {
    const names = migrateClientName(row);
    const referredBy = migrateReferredByName(row);
    const displayName = formatClientDisplayName(names);
    let id = String(row.id ?? "").trim() || slugifyClientId(displayName);
    const previous = previousById.get(id);

    if (!hasRequiredClientName(names)) {
      return { ok: false, error: "Each client needs a first and last name." };
    }

    const brand_ids = Array.isArray(row.brand_ids)
      ? [...new Set(row.brand_ids.map(String).filter(Boolean))]
      : [];

    if (brand_ids.length === 0) {
      return { ok: false, error: "Each client needs at least one production brand." };
    }

    for (const brandId of brand_ids) {
      if (!getFactoryBrandById(brandId)) {
        return { ok: false, error: `Unknown brand: ${brandId}` };
      }
    }

    const primaryBrandId = brand_ids[0];
    const prefix = getBrandClientCodePrefix(primaryBrandId);
    if (!prefix) {
      return { ok: false, error: `No client code prefix for brand: ${primaryBrandId}` };
    }

    let code = normalizeClientCode(String(row.code ?? ""));
    const joined_at = previous?.joined_at ?? new Date().toISOString();

    if (previous?.code) {
      if (code && code !== previous.code) {
        return { ok: false, error: `Client code cannot be changed: ${previous.code}` };
      }
      code = previous.code;
    } else {
      code =
        generateNextClientCode([...previousClients, ...clients], primaryBrandId, {
          joinedAt: new Date(joined_at),
        }) ?? "";
    }

    if (!code) {
      return { ok: false, error: "Could not assign a client code." };
    }

    if (seenIds.has(id)) id = `${id}-${clients.length + 1}`;
    if (seenIds.has(id) || seenCodes.has(code)) {
      return { ok: false, error: `Duplicate client id or code: ${code}` };
    }
    seenIds.add(id);
    seenCodes.add(code);

    clients.push({
      id,
      code,
      joined_at: previous?.joined_at ?? joined_at,
      first_name: normalizeNamePart(names.first_name),
      middle_name: normalizeText(names.middle_name),
      last_name: normalizeNamePart(names.last_name),
      brand_ids,
      contact_person: allowContactFields
        ? normalizeText(row.contact_person)
        : (previous?.contact_person ?? null),
      referred_by_first_name: allowContactFields
        ? referredBy.referred_by_first_name
        : (previous?.referred_by_first_name ?? null),
      referred_by_middle_name: allowContactFields
        ? referredBy.referred_by_middle_name
        : (previous?.referred_by_middle_name ?? null),
      referred_by_last_name: allowContactFields
        ? referredBy.referred_by_last_name
        : (previous?.referred_by_last_name ?? null),
      email: allowContactFields ? normalizeText(row.email) : (previous?.email ?? null),
      phone: allowContactFields ? normalizeStoredPhone(row.phone) : (previous?.phone ?? null),
      country: allowContactFields ? normalizeText(row.country) : (previous?.country ?? null),
      city: normalizeText(row.city),
      address: normalizeText(row.address),
      payment_terms: normalizeText(row.payment_terms),
      client_reference_prefix: previous?.client_reference_prefix ?? null,
      notes: normalizeText(row.notes),
      is_active: row.is_active !== false,
      client_kind: previous?.client_kind ?? (row.client_kind === "retail_brand" ? "retail_brand" : "person"),
    });
  }

  return { ok: true, data: clients };
}

export async function GET() {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const reconciliation = await ensureOrphanedClientsReconciled();
    if (reconciliation.restored.length > 0) {
      for (const client of reconciliation.restored) {
        await notifyIntegration("client.created", {
          id: client.id,
          code: client.code,
          first_name: client.first_name,
          middle_name: client.middle_name,
          last_name: client.last_name,
          brand_ids: client.brand_ids,
          restored_from: "orphan_reconciliation",
        });
      }
    }

    const data = readClients();
    return NextResponse.json(session.canViewClientContact ? data : redactClientsFile(data));
  } catch (error) {
    console.error("Failed to read clients:", error);
    return NextResponse.json({ error: "Failed to load clients." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    await ensureDocumentsLoaded(["clients", "sales_orders"]);
    const previous = readClients();
    const result = validateClients(body, previous.clients, {
      allowContactFields: session.canViewClientContact,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Bulk editor saves replace the whole list. Never drop a profile that still
    // has sales orders — that is how FR activity can appear without a Clients row.
    const protectedSave = protectLinkedClientsOnSave(previous.clients, result.data);
    if (protectedSave.retained.length > 0) {
      console.warn(
        `[clients] Retained ${protectedSave.retained.length} linked client(s) omitted from save:`,
        protectedSave.retained.map((client) => `${client.code} (${client.id})`).join(", ")
      );
    }

    const saved = await writeClients({ updated_at: null, clients: protectedSave.clients });

    const isNew = previous.clients.length === 0 && saved.clients.length > 0;
    await notifyIntegration(isNew ? "client.created" : "client.updated", {
      client_count: saved.clients.length,
      retained_linked_clients: protectedSave.retained.map((client) => client.id),
      updated_at: saved.updated_at,
    });

    const responseData = session.canViewClientContact ? saved : redactClientsFile(saved);
    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Failed to save clients:", error);
    return NextResponse.json({ error: "Failed to save clients." }, { status: 500 });
  }
}
