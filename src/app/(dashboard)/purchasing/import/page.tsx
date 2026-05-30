import { PageHeader } from "@/components/ui/PageHeader";
import { PurchasingNav } from "@/components/purchasing/PurchasingNav";
import { PriceListUpload } from "@/components/purchasing/PriceListUpload";
import { getFabricSuppliers, getSupplierPriceLists } from "@/lib/data/queries";
import { formatDate } from "@/lib/utils";

export default async function ImportPriceListPage() {
  const [suppliers, imported] = await Promise.all([
    getFabricSuppliers(),
    getSupplierPriceLists(),
  ]);

  const importedIds = new Set(imported.map((p) => p.supplier_id));

  return (
    <div>
      <PageHeader
        title="Import Price List"
        description="Upload a supplier's price list PDF or Excel — saves fabric numbers, specs, and list prices for reference"
      />
      <PurchasingNav />

      {imported.length > 0 && (
        <div className="mb-8 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="font-semibold text-emerald-900">Price lists saved</h2>
          <ul className="mt-2 space-y-1 text-sm text-emerald-800">
            {imported.map((pl) => (
              <li key={pl.id}>
                ✓ {pl.supplier?.name} — {pl.fabric_count?.toLocaleString()} list prices from {pl.source_file} ({formatDate(pl.uploaded_at)})
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-emerald-700">These are reference prices only, not stock quantities.</p>
        </div>
      )}

      <div className="space-y-8">
        {suppliers.map((supplier) => {
          const done = importedIds.has(supplier.id);
          if (done) return null;
          return (
            <div key={supplier.id}>
              <h2 className="mb-4 text-lg font-semibold text-slate-900">
                {supplier.name}{" "}
                <span className="text-sm font-normal text-slate-400">({supplier.code})</span>
              </h2>
              <PriceListUpload supplierName={supplier.name} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
