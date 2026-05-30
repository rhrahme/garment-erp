import { NextResponse } from "next/server";
import { getSupplierByIdFromContacts } from "@/lib/data/supplier-contacts";
import { searchSupplierFabrics } from "@/lib/data/supplier-catalogs";
import { expandLoroPianaStyleQuery, normalizeLoroPianaFabricNumber } from "@/lib/fabric-sourcing/loro-piana-styles";
import type { SupplierFabric } from "@/lib/types/fabric-sourcing";

const supplierNameCache = new Map<string, string>();

function supplierName(supplierId: string): string {
  if (!supplierNameCache.has(supplierId)) {
    supplierNameCache.set(
      supplierId,
      getSupplierByIdFromContacts(supplierId)?.name ?? supplierId
    );
  }
  return supplierNameCache.get(supplierId)!;
}

function buildManualFabricEntry(supplierId: string, fabricNumber: string): SupplierFabric {
  const trimmed = fabricNumber.trim();
  const supplier = getSupplierByIdFromContacts(supplierId) ?? {
    id: supplierId,
    code: supplierId.toUpperCase(),
    name: supplierName(supplierId),
    contact_person: null,
    email: null,
    country: null,
    is_fabric_supplier: true,
    lead_time_days: 14,
  };
  return {
    id: `manual-${supplierId}-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    supplier_id: supplierId,
    fabric_number: trimmed,
    name: trimmed,
    composition: null,
    weight_gsm: null,
    width_cm: null,
    width_inches: null,
    color: null,
    finish: null,
    description: "Manual entry — price list not imported yet",
    weave_type: null,
    gn_code: null,
    unit: "meters",
    unit_price: null,
    min_order_qty: null,
    lead_time_days: supplier.lead_time_days ?? 14,
    is_active: true,
    supplier,
  };
}

function toSearchItem(item: SupplierFabric, manual = false) {
  return {
    id: item.id,
    supplier_id: item.supplier_id,
    supplier_name: supplierName(item.supplier_id),
    fabric_number: item.fabric_number,
    composition: item.composition,
    color: item.color,
    weight_gsm: item.weight_gsm,
    width_cm: item.width_cm,
    width_inches: item.width_inches,
    unit_price: item.unit_price,
    unit: item.unit,
    stock_status: item.stock_status ?? null,
    restock_date: item.restock_date ?? null,
    manual,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const supplierId = url.searchParams.get("supplier_id")?.trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 60), 100);

  if (!supplierId) {
    return NextResponse.json({ error: "Select a fabric brand first." }, { status: 400 });
  }

  const catalogMatches = searchSupplierFabrics(supplierId, query, limit);
  const items = catalogMatches.map((item) => toSearchItem(item, false));

  if (query) {
    const lookupNumber =
      supplierId === "loro-piana"
        ? normalizeLoroPianaFabricNumber(query).toLowerCase()
        : query.toLowerCase();
    const exact = items.some((item) => item.fabric_number.toLowerCase() === lookupNumber);
    const rangeMatch =
      supplierId === "loro-piana" && expandLoroPianaStyleQuery(query).length > 1;
    if (!exact && !rangeMatch) {
      items.unshift(toSearchItem(buildManualFabricEntry(supplierId, query), true));
    }
  }

  return NextResponse.json({ items: items.slice(0, limit) });
}
