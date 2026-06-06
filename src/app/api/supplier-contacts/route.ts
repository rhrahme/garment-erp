import { NextResponse } from "next/server";
import {
  formatEmailList,
  isValidEmail,
  normalizeEmail,
  normalizeEmailList,
  normalizeText,
  readSupplierContacts,
  writeSupplierContacts,
  type SupplierContactRow,
  type SupplierContactsFile,
} from "@/lib/data/supplier-contacts";
import { notifyIntegration } from "@/lib/integrations";

export async function GET() {
  try {
    return NextResponse.json(readSupplierContacts());
  } catch (error) {
    console.error("Failed to read supplier contacts:", error);
    return NextResponse.json({ error: "Failed to load supplier contacts" }, { status: 500 });
  }
}

function validatePayload(body: unknown): { ok: true; data: SupplierContactsFile } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request body" };
  }

  const input = body as Partial<SupplierContactsFile>;
  if (!Array.isArray(input.suppliers)) {
    return { ok: false, error: "Suppliers list is required" };
  }

  const factoryEmail = normalizeEmail(input.factory_orders_email ?? null);
  if (factoryEmail && !isValidEmail(factoryEmail)) {
    return { ok: false, error: "Factory orders email is not valid" };
  }

  const inboxScanEmail = normalizeEmail(input.inbox_scan_email ?? null);
  if (inboxScanEmail && !isValidEmail(inboxScanEmail)) {
    return { ok: false, error: "Inbox scan email is not valid" };
  }

  const seenIds = new Set<string>();
  const suppliers: SupplierContactRow[] = [];

  for (const row of input.suppliers) {
    if (!row || typeof row !== "object") {
      return { ok: false, error: "Each supplier row must be an object" };
    }

    const id = String((row as SupplierContactRow).id ?? "").trim();
    const code = String((row as SupplierContactRow).code ?? "").trim();
    const name = String((row as SupplierContactRow).name ?? "").trim();

    if (!id || !code || !name) {
      return { ok: false, error: "Each supplier needs id, code, and name" };
    }

    if (seenIds.has(id)) {
      return { ok: false, error: `Duplicate supplier id: ${id}` };
    }
    seenIds.add(id);

    const emails = normalizeEmailList(
      (row as SupplierContactRow).emails,
      (row as SupplierContactRow).email
    );
    for (const email of emails) {
      if (!isValidEmail(email)) {
        return { ok: false, error: `Invalid email for ${name}: ${email}` };
      }
    }

    const leadTime = Number((row as SupplierContactRow).lead_time_days ?? 14);
    if (!Number.isFinite(leadTime) || leadTime < 0) {
      return { ok: false, error: `Invalid lead time for ${name}` };
    }

    suppliers.push({
      id,
      code,
      name,
      country: normalizeText((row as SupplierContactRow).country),
      contact_person: normalizeText((row as SupplierContactRow).contact_person),
      emails,
      email: emails.length > 0 ? formatEmailList(emails) : null,
      lead_time_days: Math.round(leadTime),
      has_price_list: Boolean((row as SupplierContactRow).has_price_list),
      notes: normalizeText((row as SupplierContactRow).notes),
    });
  }

  return {
    ok: true,
    data: {
      factory_orders_email: factoryEmail,
      inbox_scan_email: inboxScanEmail,
      notes: typeof input.notes === "string" ? input.notes : null,
      updated_at: null,
      suppliers,
    },
  };
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const result = validatePayload(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const saved = await writeSupplierContacts(result.data);
    await notifyIntegration("supplier.contacts_updated", {
      supplier_count: saved.suppliers.length,
      with_email: saved.suppliers.filter((s) => s.emails.length > 0).length,
      factory_orders_email: saved.factory_orders_email,
      updated_at: saved.updated_at,
    });
    return NextResponse.json(saved);
  } catch (error) {
    console.error("Failed to save supplier contacts:", error);
    return NextResponse.json({ error: "Failed to save supplier contacts" }, { status: 500 });
  }
}
