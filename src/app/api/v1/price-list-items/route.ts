import { NextResponse } from "next/server";
import { getAllPriceListItems } from "@/lib/data/supplier-catalogs";
import { verifyApiKey } from "@/lib/integrations/api-auth";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const supplierId = url.searchParams.get("supplier_id")?.trim();
  const fabricNumber = url.searchParams.get("fabric_number")?.trim();

  let items = getAllPriceListItems();
  if (supplierId) items = items.filter((item) => item.supplier_id === supplierId);
  if (fabricNumber) items = items.filter((item) => item.fabric_number === fabricNumber);

  return NextResponse.json({
    count: items.length,
    items: items.slice(0, 100).map((item) => ({
      id: item.id,
      supplier_id: item.supplier_id,
      fabric_number: item.fabric_number,
      composition: item.composition,
      color: item.color,
      weight_gsm: item.weight_gsm,
      width_cm: item.width_cm,
      gn_code: item.gn_code,
      unit_price: item.unit_price,
      unit: item.unit,
    })),
  });
}
