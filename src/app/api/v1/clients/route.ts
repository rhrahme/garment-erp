import { NextResponse } from "next/server";
import { generateNextClientCode, getBrandClientCodePrefix } from "@/lib/clients/codes";
import { formatClientDisplayName, hasRequiredClientName, migrateReferredByName, normalizeNamePart } from "@/lib/clients/names";
import {
  ensureOrphanedClientsReconciled,
  getActiveClients,
  getClientById,
  readClients,
  slugifyClientId,
  writeClients,
} from "@/lib/data/clients";
import { getFactoryBrandById } from "@/lib/data/factory-brands";
import { normalizeStoredPhone } from "@/lib/phone/countries";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { notifyIntegration } from "@/lib/integrations";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import type { ClientProfile } from "@/lib/types/clients";

function normalizeText(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  const reconciliation = await ensureOrphanedClientsReconciled();
  if (reconciliation.restored.length > 0) {
    for (const client of reconciliation.restored) {
      await notifyIntegration(
        "client.created",
        {
          id: client.id,
          code: client.code,
          first_name: client.first_name,
          middle_name: client.middle_name,
          last_name: client.last_name,
          brand_ids: client.brand_ids,
          restored_from: "orphan_reconciliation",
        },
        "api"
      );
    }
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const client = getClientById(id);
    if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });
    return NextResponse.json({ client });
  }

  return NextResponse.json({ clients: getActiveClients() });
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as Partial<ClientProfile> & { name?: string };
    const first_name = normalizeNamePart(body.first_name ?? "");
    const middle_name = normalizeText(body.middle_name);
    const last_name = normalizeNamePart(body.last_name ?? body.name ?? "");

    if (!hasRequiredClientName({ first_name, last_name })) {
      return NextResponse.json({ error: "first_name and last_name are required." }, { status: 400 });
    }

    const displayName = formatClientDisplayName({ first_name, middle_name, last_name });

    const brand_ids = Array.isArray(body.brand_ids) ? [...new Set(body.brand_ids.map(String))] : [];
    if (brand_ids.length === 0) {
      return NextResponse.json({ error: "brand_ids is required." }, { status: 400 });
    }

    for (const brandId of brand_ids) {
      if (!getFactoryBrandById(brandId)) {
        return NextResponse.json({ error: `Unknown brand: ${brandId}` }, { status: 400 });
      }
    }

    const primaryBrandId = brand_ids[0];
    if (!getBrandClientCodePrefix(primaryBrandId)) {
      return NextResponse.json({ error: `No client code prefix for brand: ${primaryBrandId}` }, { status: 400 });
    }

    await ensureDocumentsLoaded(["clients"]);
    const store = readClients();
    const joined_at = new Date().toISOString();
    const code = generateNextClientCode(store.clients, primaryBrandId, { joinedAt: new Date(joined_at) });
    if (!code) {
      return NextResponse.json({ error: "Could not assign a client code." }, { status: 400 });
    }

    if (store.clients.some((c) => c.code === code)) {
      return NextResponse.json({ error: `Client code already exists: ${code}` }, { status: 400 });
    }

    const referredBy = migrateReferredByName(body);

    const client: ClientProfile = {
      id: slugifyClientId(displayName) || `client-${Date.now()}`,
      code,
      joined_at,
      first_name,
      middle_name,
      last_name,
      brand_ids,
      contact_person: normalizeText(body.contact_person),
      referred_by_first_name: referredBy.referred_by_first_name,
      referred_by_middle_name: referredBy.referred_by_middle_name,
      referred_by_last_name: referredBy.referred_by_last_name,
      email: normalizeText(body.email),
      phone: normalizeStoredPhone(body.phone),
      country: normalizeText(body.country),
      city: normalizeText(body.city),
      address: normalizeText(body.address),
      payment_terms: normalizeText(body.payment_terms),
      client_reference_prefix: null,
      notes: normalizeText(body.notes),
      is_active: body.is_active !== false,
    };

    store.clients.push(client);
    const saved = await writeClients(store);

    await notifyIntegration("client.created", {
      id: client.id,
      code: client.code,
      first_name: client.first_name,
      middle_name: client.middle_name,
      last_name: client.last_name,
      brand_ids: client.brand_ids,
    }, "api");

    return NextResponse.json({ client, updated_at: saved.updated_at }, { status: 201 });
  } catch (error) {
    console.error("Create client failed:", error);
    return NextResponse.json({ error: "Failed to create client." }, { status: 500 });
  }
}
