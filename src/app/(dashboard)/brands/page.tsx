import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import {
  getFactoryBrands,
  getFabricSourcingLabel,
  getFabricSourcingDescription,
  type FabricSourcingType,
} from "@/lib/data/factory-brands";

function sourcingBadgeClass(type: FabricSourcingType): string {
  switch (type) {
    case "supplier_catalog":
      return "bg-indigo-100 text-indigo-700";
    case "warehouse_stock":
      return "bg-emerald-100 text-emerald-700";
    case "pending":
      return "bg-amber-100 text-amber-700";
  }
}

export default function BrandsPage() {
  const brands = getFactoryBrands();
  const supplierBrands = brands.filter((b) => b.fabric_sourcing === "supplier_catalog");
  const stockBrands = brands.filter((b) => b.fabric_sourcing === "warehouse_stock");

  return (
    <div>
      <PageHeader
        title="Production Brands"
        description="The four brands your factory produces — each with its own fabric sourcing rules."
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4 text-sm text-indigo-900">
          <p className="font-medium">Supplier fabrics → {supplierBrands.map((b) => b.name).join(", ")}</p>
          <p className="mt-1 text-indigo-800">
            Use{" "}
            <Link href="/fabric-specification" className="font-medium underline">
              Fabric Specification
            </Link>{" "}
            and{" "}
            <Link href="/purchasing" className="font-medium underline">
              Purchasing
            </Link>{" "}
            to order from Caccioppoli, Zegna, Drapers, and other suppliers.
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
          <p className="font-medium">Stock fabrics → {stockBrands.map((b) => b.name).join(", ")}</p>
          <p className="mt-1 text-emerald-800">
            Uses fabric already in the warehouse. Stock list coming soon — tracked in{" "}
            <Link href="/inventory" className="font-medium underline">
              Inventory
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {brands.map((brand) => (
          <div key={brand.id} className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{brand.code}</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{brand.name}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className={sourcingBadgeClass(brand.fabric_sourcing)}>
                  {getFabricSourcingLabel(brand.fabric_sourcing)}
                </Badge>
                {brand.product_types.length === 0 && (
                  <Badge className="bg-amber-100 text-amber-700">Details pending</Badge>
                )}
              </div>
            </div>

            {brand.description && (
              <p className="mt-3 text-sm text-slate-600">{brand.description}</p>
            )}

            <p className="mt-3 text-sm text-slate-500">{getFabricSourcingDescription(brand.fabric_sourcing)}</p>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Product types</p>
              {brand.product_types.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {brand.product_types.map((type) => (
                    <span
                      key={type}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-700"
                    >
                      {type}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-400">To be added</p>
              )}
            </div>

            {brand.market && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Market</p>
                <p className="mt-1 text-sm text-slate-600">{brand.market}</p>
              </div>
            )}

            {brand.notes && (
              <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{brand.notes}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
