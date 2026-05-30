import { NextResponse } from "next/server";
import { attachLiveSupplierContacts, getAllPriceListItems } from "@/lib/data/supplier-catalogs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const supplierId = url.searchParams.get("supplier_id")?.trim();

  let items = attachLiveSupplierContacts(getAllPriceListItems());
  if (supplierId) {
    items = items.filter((item) => item.supplier_id === supplierId);
  }

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      supplier_id: item.supplier_id,
      supplier_name: item.supplier?.name ?? item.supplier_id,
      fabric_number: item.fabric_number,
      composition: item.composition,
      description: item.description,
      weight_gsm: item.weight_gsm,
      width_cm: item.width_cm,
      width_inches: item.width_inches,
      color: item.color,
      finish: item.finish,
      unit: item.unit,
      unit_price: item.unit_price,
    })),
  });
}
