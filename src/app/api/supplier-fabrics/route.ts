import { NextResponse } from "next/server";
import { attachLiveSupplierContacts, getAllPriceListItems } from "@/lib/data/supplier-catalogs";
import { resolveFabricSupplierId } from "@/lib/fabric-sourcing/supplier-aliases";
import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import { getLoroPianaMillLine } from "@/lib/fabric-sourcing/loro-piana-styles";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawSupplierId = url.searchParams.get("supplier_id")?.trim();
  const supplierId = rawSupplierId ? resolveFabricSupplierId(rawSupplierId) : undefined;

  let items = attachLiveSupplierContacts(getAllPriceListItems());
  if (supplierId) {
    items = items.filter((item) => resolveFabricSupplierId(item.supplier_id) === supplierId);
  }

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      supplier_id: item.supplier_id,
      supplier_name: formatFabricSupplierName(
        item.supplier_id,
        item.supplier?.name ?? item.supplier_id,
        item.fabric_number
      ),
      mill_line:
        item.mill_line ??
        (item.supplier_id === "loro-piana" || item.supplier_id === "solbiati"
          ? getLoroPianaMillLine(item.fabric_number)
          : null),
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
