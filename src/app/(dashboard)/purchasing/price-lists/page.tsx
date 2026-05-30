import { PageHeader } from "@/components/ui/PageHeader";
import { PurchasingNav } from "@/components/purchasing/PurchasingNav";
import { PriceListTable } from "@/components/purchasing/PriceListTable";
import { getFabricSuppliers, getPriceListItems, getSupplierPriceLists } from "@/lib/data/queries";
import { formatDate } from "@/lib/utils";

export default async function PriceListsPage() {
  const [suppliers, priceListItems, priceLists] = await Promise.all([
    getFabricSuppliers(),
    getPriceListItems(),
    getSupplierPriceLists(),
  ]);

  return (
    <div>
      <PageHeader
        title="Supplier Price Lists"
        description="Reference list prices from your suppliers — fabric number, specs, and price per meter. Not stock on hand."
      />
      <PurchasingNav />

      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
        <p className="font-medium">Price list only — not inventory</p>
        <p className="mt-1 text-blue-800">
          This saves what each supplier charges for each fabric. Stock on hand is tracked separately
          in <strong>Inventory</strong>, and only updates when fabric physically arrives at your factory.
        </p>
      </div>

      {priceLists.length > 0 && (
        <div className="mb-6 space-y-3">
          {priceLists.map((pl) => (
            <div key={pl.id} className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
              <div>
                <p className="font-semibold text-emerald-900">
                  {pl.supplier?.name} — {pl.name}
                </p>
                <p className="text-sm text-emerald-700">
                  {pl.fabric_count?.toLocaleString()} list prices saved from {pl.source_file}
                </p>
              </div>
              <div className="text-right text-sm text-emerald-600">
                <p>{pl.currency} · {formatDate(pl.uploaded_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {suppliers.map((s) => {
          const count = priceListItems.filter((f) => f.supplier_id === s.id).length;
          return (
            <div key={s.id} className={`rounded-xl border p-4 ${count > 0 ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-white"}`}>
              <p className="text-xs font-medium text-slate-500">{s.code}</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900">{s.name}</p>
              <p className={`mt-2 text-2xl font-bold ${count > 0 ? "text-indigo-600" : "text-slate-300"}`}>{count}</p>
              <p className="text-xs text-slate-400">{count > 0 ? "list prices saved" : "no price list yet"}</p>
            </div>
          );
        })}
      </div>

      <PriceListTable suppliers={suppliers} items={priceListItems} />
    </div>
  );
}
