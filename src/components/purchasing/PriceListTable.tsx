"use client";

import { Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/ui/PageHeader";
import { DualCurrencyPrice } from "@/components/currency/DualCurrencyPrice";
import { FabricSwatchProvider } from "@/components/fabric/FabricSwatchProvider";
import { FabricSwatchPreview } from "@/components/fabric/FabricSwatchPreview";
import { useFabricSpecPricesVisibility } from "@/hooks/useFabricSpecPricesVisibility";
import { MASKED_FABRIC_PRICE } from "@/lib/auth/fabric-price.constants";
import type { Supplier, SupplierFabric } from "@/lib/types/fabric-sourcing";

interface PriceListTableProps {
  suppliers: Supplier[];
  items: SupplierFabric[];
}

export function PriceListTable({ suppliers, items }: PriceListTableProps) {
  const [supplierId, setSupplierId] = useState<string>("all");
  const [query, setQuery] = useState("");
  const { visible: showPrices, unlock, lock } = useFabricSpecPricesVisibility(false);

  const filtered = useMemo(() => {
    let list = items;
    if (supplierId !== "all") list = list.filter((f) => f.supplier_id === supplierId);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (f) =>
          f.fabric_number.includes(q) ||
          f.color?.toLowerCase().includes(q) ||
          f.composition?.toLowerCase().includes(q) ||
          f.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, supplierId, query]);

  const display = filtered.slice(0, 100);

  const swatchFabrics = useMemo(
    () =>
      display.map((f) => ({
        supplier_id: f.supplier_id,
        fabric_number: f.fabric_number,
      })),
    [display]
  );

  return (
    <FabricSwatchProvider fabrics={swatchFabrics}>
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({items.filter((f) => f.supplier_id === s.id).length} prices)
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search fabric number, color, composition…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => (showPrices ? lock() : unlock())}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          title={showPrices ? "Hide fabric prices" : "Show fabric prices"}
          aria-label={showPrices ? "Hide fabric prices" : "Show fabric prices"}
          aria-pressed={showPrices}
          data-prices-visible={showPrices ? "1" : "0"}
        >
          {showPrices ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showPrices ? "Hide" : "Show"}
        </button>
        <span className="text-sm text-slate-500">
          {filtered.length.toLocaleString()} list prices
          {filtered.length > 100 ? " (showing first 100)" : ""}
          {showPrices ? "" : " · prices hidden"}
        </span>
      </div>

      <DataTable
        key={showPrices ? "prices-on" : "prices-off"}
        columns={[
          { key: "preview", label: "" },
          { key: "supplier", label: "Supplier" },
          { key: "fabricNo", label: "Fabric No." },
          { key: "composition", label: "Composition" },
          { key: "color", label: "Color" },
          { key: "description", label: "Pattern" },
          { key: "specs", label: "Weight / Width" },
          { key: "price", label: "List price" },
        ]}
        rows={display.map((f) => ({
          preview: (
            <FabricSwatchPreview
              supplierId={f.supplier_id}
              fabricNumber={f.fabric_number}
              highlight={f.stock_status != null && f.stock_status !== "in_stock"}
            />
          ),
          supplier: f.supplier?.name ?? "—",
          fabricNo: <span className="font-mono font-medium">{f.fabric_number}</span>,
          composition: <span className="text-xs">{f.composition ?? "—"}</span>,
          color: f.color ?? "—",
          description: f.description ?? "—",
          specs: `${f.weight_gsm ?? "—"}gsm · ${f.width_cm ?? "—"}cm`,
          price: showPrices ? (
            f.unit_price != null ? (
              <DualCurrencyPrice amount={f.unit_price} supplierId={f.supplier_id} unit={f.unit} />
            ) : (
              <span className="text-slate-400">Discontinued</span>
            )
          ) : (
            <span className="text-slate-400">{MASKED_FABRIC_PRICE}</span>
          ),
        }))}
        emptyMessage="No fabrics match your search."
      />
    </div>
    </FabricSwatchProvider>
  );
}
