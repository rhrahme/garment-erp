import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SUPPLIER_CODE = "CANCLINI";
const WAREHOUSE_LOCATION = "HAGAN Warehouse";

interface CancliniFabric {
  fabric_number: string;
  composition?: string | null;
  color?: string | null;
  description?: string | null;
  weight_gsm?: number | null;
  width_cm?: number | null;
  unit_price?: number | null;
  available_meters?: number | null;
}

export interface SeedCancliniResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  catalogCount: number;
  materialsUpserted: number;
  inventoryRows: number;
  totalCancliniMaterials?: number;
  withMeters: number;
}

function fabrics(): CancliniFabric[] {
  const catalogPath = resolve(process.cwd(), "src/data/suppliers/canclini-linen-stock.json");
  const raw = JSON.parse(readFileSync(catalogPath, "utf8")) as { fabrics?: CancliniFabric[] };
  return raw.fabrics ?? [];
}

function materialRow(fabric: CancliniFabric, supplierId: string) {
  return {
    code: fabric.fabric_number,
    name: fabric.description || `Canclini ${fabric.fabric_number}`,
    material_type: "fabric" as const,
    unit: "meters" as const,
    color: fabric.color ?? null,
    composition: fabric.composition ?? "100% Linen",
    width_cm: fabric.width_cm ?? null,
    gsm: fabric.weight_gsm ?? null,
    unit_cost: fabric.unit_price ?? 0,
    reorder_level: 0,
    supplier_id: supplierId,
  };
}

async function probeTable(admin: SupabaseClient, table: string): Promise<boolean> {
  const { error } = await admin.from(table).select("id").limit(1);
  return !error;
}

async function getOrCreateSupplier(admin: SupabaseClient) {
  const { data: existing, error: readError } = await admin
    .from("suppliers")
    .select("id, code, name")
    .eq("code", SUPPLIER_CODE)
    .maybeSingle();

  if (readError) throw new Error(`suppliers read: ${readError.message}`);
  if (existing) return existing;

  const { data: created, error: createError } = await admin
    .from("suppliers")
    .insert({
      code: SUPPLIER_CODE,
      name: "Canclini",
      country: "Italy",
      is_fabric_supplier: true,
      lead_time_days: 0,
    })
    .select("id, code, name")
    .single();

  if (createError) throw new Error(`suppliers insert: ${createError.message}`);
  return created;
}

async function countSeededMaterials(admin: SupabaseClient, supplierId: string, codes: string[]) {
  const { count, error } = await admin
    .from("materials")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", supplierId)
    .in("code", codes);

  if (error) throw new Error(`materials count: ${error.message}`);
  return count ?? 0;
}

export async function seedCancliniInventory(
  admin: SupabaseClient,
  options: { force?: boolean; dryRun?: boolean } = {}
): Promise<SeedCancliniResult> {
  const catalog = fabrics();
  const withMeters = catalog.filter((f) => f.available_meters != null).length;

  if (!(await probeTable(admin, "suppliers"))) {
    return {
      ok: false,
      catalogCount: catalog.length,
      materialsUpserted: 0,
      inventoryRows: 0,
      withMeters,
      reason:
        "Missing warehouse tables. Run supabase/migrations/007_warehouse_inventory.sql in Supabase SQL Editor first.",
    };
  }

  if (options.dryRun) {
    return {
      ok: true,
      catalogCount: catalog.length,
      materialsUpserted: catalog.length,
      inventoryRows: catalog.length,
      withMeters,
      reason: "dry-run",
    };
  }

  const supplier = await getOrCreateSupplier(admin);
  const codes = catalog.map((f) => f.fabric_number);
  const existingCount = await countSeededMaterials(admin, supplier.id, codes);

  if (!options.force && existingCount >= catalog.length) {
    return {
      ok: true,
      skipped: true,
      catalogCount: catalog.length,
      materialsUpserted: 0,
      inventoryRows: 0,
      totalCancliniMaterials: existingCount,
      withMeters,
      reason: `Already seeded (${existingCount}/${catalog.length} materials).`,
    };
  }

  let materialsUpserted = 0;
  let inventoryRows = 0;

  for (const fabric of catalog) {
    const row = materialRow(fabric, supplier.id);
    const { data: material, error: matError } = await admin
      .from("materials")
      .upsert(row, { onConflict: "code" })
      .select("id, code")
      .single();

    if (matError) continue;
    materialsUpserted += 1;

    const quantity = typeof fabric.available_meters === "number" ? fabric.available_meters : 0;
    const { error: invError } = await admin.from("inventory").upsert(
      {
        material_id: material.id,
        quantity_on_hand: quantity,
        quantity_reserved: 0,
        location: WAREHOUSE_LOCATION,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "material_id" }
    );

    if (!invError) inventoryRows += 1;
  }

  const { count: totalCancliniMaterials } = await admin
    .from("materials")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", supplier.id);

  return {
    ok: materialsUpserted > 0,
    catalogCount: catalog.length,
    materialsUpserted,
    inventoryRows,
    totalCancliniMaterials: totalCancliniMaterials ?? materialsUpserted,
    withMeters,
  };
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
