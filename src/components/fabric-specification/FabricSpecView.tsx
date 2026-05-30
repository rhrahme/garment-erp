"use client";

import { useMemo, useState } from "react";
import { DataTable } from "@/components/ui/PageHeader";
import { DualCurrencyPrice } from "@/components/currency/DualCurrencyPrice";
import { expandLoroPianaStyleQuery, normalizeLoroPianaFabricNumber } from "@/lib/fabric-sourcing/loro-piana-styles";
import { fabricStockTone, formatFabricStockLabel } from "@/lib/fabric-sourcing/fabric-stock";
import type { Supplier, SupplierFabric } from "@/lib/types/fabric-sourcing";
import { cn } from "@/lib/utils";

interface FabricSpecViewProps {
  suppliers: Supplier[];
  items: SupplierFabric[];
}

export function FabricSpecView({ suppliers, items }: FabricSpecViewProps) {
  const brands = useMemo(() => {
    return [...suppliers]
      .map((s) => ({
        ...s,
        count: items.filter((i) => i.supplier_id === s.id).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers, items]);

  const firstWithData = brands.find((b) => b.count > 0)?.id ?? brands[0]?.id ?? "all";
  const [brandId, setBrandId] = useState<string>(firstWithData);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let list = brandId === "all" ? items : items.filter((i) => i.supplier_id === brandId);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const lookup =
        brandId === "loro-piana" || brandId === "all"
          ? normalizeLoroPianaFabricNumber(query).toLowerCase()
          : q;
      const rangeNumbers =
        brandId === "loro-piana" || brandId === "all"
          ? expandLoroPianaStyleQuery(query).map((n) => n.toLowerCase())
          : [];
      if (rangeNumbers.length > 1) {
        const numberSet = new Set(rangeNumbers);
        list = list.filter((f) => numberSet.has(f.fabric_number.toLowerCase()));
      } else {
        list = list.filter(
          (f) =>
            f.fabric_number.toLowerCase() === lookup ||
            f.fabric_number.includes(lookup) ||
            f.color?.toLowerCase().includes(q) ||
            f.composition?.toLowerCase().includes(q) ||
            f.description?.toLowerCase().includes(q) ||
            f.gn_code?.includes(q)
        );
      }
    }
    return list.sort((a, b) => {
      const brandCmp = (a.supplier?.name ?? "").localeCompare(b.supplier?.name ?? "");
      if (brandCmp !== 0 && brandId === "all") return brandCmp;
      return a.fabric_number.localeCompare(b.fabric_number);
    });
  }, [items, brandId, query]);

  const display = filtered.slice(0, 150);
  const activeBrand = brands.find((b) => b.id === brandId);
  const showStockColumn = filtered.some((fabric) => fabric.stock_status && fabric.stock_status !== "in_stock");

  return (
    <div className="flex gap-6">
      {/* Brand list — left panel */}
      <aside className="w-56 shrink-0">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Brand</p>
        <ul className="space-y-1">
          <li>
            <button
              onClick={() => setBrandId("all")}
              className={cn(
                "w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                brandId === "all"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              )}
            >
              All brands
              <span className={cn("ml-1 text-xs", brandId === "all" ? "text-indigo-200" : "text-slate-400")}>
                ({items.length})
              </span>
            </button>
          </li>
          {brands.map((brand) => (
            <li key={brand.id}>
              <button
                onClick={() => setBrandId(brand.id)}
                className={cn(
                  "w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  brandId === brand.id
                    ? "bg-indigo-600 text-white"
                    : "text-slate-700 hover:bg-slate-100",
                  brand.count === 0 && "opacity-50"
                )}
              >
                {brand.name}
                <span className={cn("ml-1 text-xs", brandId === brand.id ? "text-indigo-200" : "text-slate-400")}>
                  ({brand.count})
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Specs table — main panel */}
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {brandId === "all" ? "All brands" : activeBrand?.name ?? "—"}
            </h2>
            <p className="text-sm text-slate-500">
              {filtered.length.toLocaleString()} fabrics · reference price list, not stock
            </p>
          </div>
          <input
            type="search"
            placeholder="Search fabric no., HS code, color…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ml-auto w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-72"
          />
        </div>

        <DataTable
          columns={[
            ...(brandId === "all" ? [{ key: "brand", label: "Brand" }] : []),
            { key: "fabricNo", label: "Fabric No." },
            { key: "composition", label: "Composition" },
            { key: "color", label: "Color" },
            { key: "pattern", label: "Pattern" },
            { key: "weight", label: "Weight" },
            { key: "width", label: "Width" },
          { key: "hsCode", label: "HS Code" },
          { key: "mill", label: "Mill" },
          { key: "price", label: "List price/m" },
          ...(showStockColumn ? [{ key: "stock", label: "Stock" }] : []),
          ]}
          rows={display.map((f) => ({
            ...(brandId === "all" ? { brand: f.supplier?.name ?? "—" } : {}),
            fabricNo: <span className="font-mono font-medium">{f.fabric_number}</span>,
            composition: <span className="text-xs">{f.composition ?? "—"}</span>,
            color: f.color ?? "—",
            pattern: f.description ?? "—",
            weight: f.weight_gsm != null ? `${f.weight_gsm} gsm` : "—",
            width: f.width_cm != null ? `${f.width_cm} cm` : "—",
          hsCode: f.gn_code ? (
            <span className="font-mono text-xs">{f.gn_code}</span>
          ) : "—",
          mill: f.weave_type ? <span className="text-xs">{f.weave_type}</span> : "—",
          price:
            f.unit_price != null ? (
              <DualCurrencyPrice amount={f.unit_price} supplierId={f.supplier_id} unit="m" />
            ) : (
              <span className="text-slate-400">—</span>
            ),
          stock: (() => {
            const label = formatFabricStockLabel(f);
            if (!label) return <span className="text-emerald-700">In stock</span>;
            const tone = fabricStockTone(f.stock_status);
            const className =
              tone === "danger"
                ? "font-medium text-red-700"
                : tone === "warn"
                  ? "font-medium text-amber-800"
                  : "text-slate-600";
            return <span className={className}>{label}</span>;
          })(),
          }))}
          emptyMessage={
            activeBrand?.count === 0
              ? "No price list uploaded for this brand yet."
              : "No fabrics match your search."
          }
        />
        {filtered.length > 150 && (
          <p className="mt-3 text-center text-xs text-slate-400">
            Showing first 150 of {filtered.length.toLocaleString()} — use search to narrow down
          </p>
        )}
      </div>
    </div>
  );
}
