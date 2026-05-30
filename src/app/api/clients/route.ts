import { NextResponse } from "next/server";
import { generateNextClientCode, getBrandClientCodePrefix } from "@/lib/clients/codes";
import { formatClientDisplayName, formatReferredByName, hasRequiredClientName, migrateClientName, migrateReferredByName, normalizeNamePart } from "@/lib/clients/names";
import { normalizeStoredPhone } from "@/lib/phone/countries";
import {
  normalizeClientCode,
  readClients,
  slugifyClientId,
  writeClients,
} from "@/lib/data/clients";
import { getFactoryBrandById } from "@/lib/data/factory-brands";
import { notifyIntegration } from "@/lib/integrations";
import type { ClientProfile } from "@/lib/types/clients";

function normalizeText(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateClients(
  body: unknown,
  previousClients: ClientProfile[] = []
): { ok: true; data: ClientProfile[] } | { ok: false; error: string } {
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
      contact_person: normalizeText(row.contact_person),
      referred_by_first_name: referredBy.referred_by_first_name,
      referred_by_middle_name: referredBy.referred_by_middle_name,
      referred_by_last_name: referredBy.referred_by_last_name,
      email: normalizeText(row.email),
      phone: normalizeStoredPhone(row.phone),
      country: normalizeText(row.country),
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
    return NextResponse.json(readClients());
  } catch (error) {
    console.error("Failed to read clients:", error);
    return NextResponse.json({ error: "Failed to load clients." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const previous = readClients();
    const result = validateClients(body, previous.clients);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const saved = writeClients({ updated_at: null, clients: result.data });

    const isNew = previous.clients.length === 0 && saved.clients.length > 0;
    await notifyIntegration(isNew ? "client.created" : "client.updated", {
      client_count: saved.clients.length,
      updated_at: saved.updated_at,
    });

    return NextResponse.json(saved);
  } catch (error) {
    console.error("Failed to save clients:", error);
    return NextResponse.json({ error: "Failed to save clients." }, { status: 500 });
  }
}
