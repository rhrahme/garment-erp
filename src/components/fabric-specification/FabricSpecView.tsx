"use client";

import { useMemo, useState } from "react";
import { FabricSpecPreview } from "@/components/fabric-specification/FabricSpecPreview";
import { DataTable } from "@/components/ui/PageHeader";
import { DualCurrencyPrice } from "@/components/currency/DualCurrencyPrice";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useDrapersSwatchMap } from "@/hooks/useDrapersSwatchMap";
import { DRAPERS_SUPPLIER_ID } from "@/lib/integrations/drapers/config";
import {
  expandLoroPianaStyleQuery,
  isLoroPianaStyleSupplier,
  normalizeLoroPianaFabricNumber,
} from "@/lib/fabric-sourcing/loro-piana-styles";
import { resolveFabricSupplierId } from "@/lib/fabric-sourcing/supplier-aliases";
import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import { formatFabricPatternLabel, formatFabricTextLabel } from "@/lib/fabric-sourcing/fabric-display";
import { fabricStockTone, formatFabricStockLabel } from "@/lib/fabric-sourcing/fabric-stock";
import type { Supplier, SupplierFabric } from "@/lib/types/fabric-sourcing";
import { cn } from "@/lib/utils";

interface FabricSpecViewProps {
  suppliers: Supplier[];
  items: SupplierFabric[];
  canViewPrices?: boolean;
}

export function FabricSpecView({ suppliers, items, canViewPrices = true }: FabricSpecViewProps) {
  const brandCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = resolveFabricSupplierId(item.supplier_id);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const itemsBySupplier = useMemo(() => {
    const map = new Map<string, SupplierFabric[]>();
    for (const item of items) {
      const key = resolveFabricSupplierId(item.supplier_id);
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [items]);

  const brands = useMemo(() => {
    return [...suppliers]
      .map((s) => ({
        ...s,
        count: brandCounts.get(resolveFabricSupplierId(s.id)) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers, brandCounts]);

  const firstWithData = brands.find((b) => b.count > 0)?.id ?? brands[0]?.id ?? "all";
  const [brandId, setBrandId] = useState<string>(firstWithData);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);

  const filtered = useMemo(() => {
    const resolvedBrandId = brandId === "all" ? "all" : resolveFabricSupplierId(brandId);
    let list = resolvedBrandId === "all" ? items : (itemsBySupplier.get(resolvedBrandId) ?? []);
    const search = debouncedQuery.trim();
    if (search) {
      const q = search.toLowerCase();
      const usesLpStyleSearch = brandId === "all" || isLoroPianaStyleSupplier(brandId);
      const lookup = usesLpStyleSearch ? normalizeLoroPianaFabricNumber(search).toLowerCase() : q;
      const rangeNumbers = usesLpStyleSearch
        ? expandLoroPianaStyleQuery(search).map((n) => n.toLowerCase())
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
            f.finish?.toLowerCase().includes(q) ||
            f.gn_code?.includes(q)
        );
      }
    }
    return list;
  }, [items, itemsBySupplier, brandId, debouncedQuery]);

  const sortedDisplay = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const brandCmp = (a.supplier?.name ?? "").localeCompare(b.supplier?.name ?? "");
      if (brandCmp !== 0 && brandId === "all") return brandCmp;
      return a.fabric_number.localeCompare(b.fabric_number);
    });
    return sorted.slice(0, 150);
  }, [filtered, brandId]);

  const showStockColumn = useMemo(
    () => filtered.some((fabric) => fabric.stock_status && fabric.stock_status !== "in_stock"),
    [filtered]
  );

  const drapersFabricNumbers = useMemo(
    () =>
      sortedDisplay
        .filter((f) => f.supplier_id === DRAPERS_SUPPLIER_ID)
        .map((f) => f.fabric_number)
        .slice(0, 60),
    [sortedDisplay]
  );

  const drapersSwatchMap = useDrapersSwatchMap(drapersFabricNumbers);

  const activeBrand = brands.find((b) => b.id === brandId);
  const isSolbiatiTab = brandId === "solbiati";
  const solbiatiBrand = brands.find((b) => b.id === "solbiati");

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
          {brands.map((brand) => {
            const isSolbiati = brand.id === "solbiati";
            const isActive = brandId === brand.id;
            return (
              <li key={brand.id}>
                <button
                  onClick={() => setBrandId(brand.id)}
                  className={cn(
                    "w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                    isActive
                      ? isSolbiati
                        ? "bg-emerald-600 text-white"
                        : "bg-indigo-600 text-white"
                      : "text-slate-700 hover:bg-slate-100",
                    brand.count === 0 && "opacity-50",
                    isSolbiati && brand.count > 0 && !isActive && "ring-2 ring-emerald-400/70 ring-offset-1"
                  )}
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    {brand.name}
                    {isSolbiati && brand.count > 0 ? (
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          isActive ? "bg-emerald-500 text-white" : "bg-emerald-100 text-emerald-800"
                        )}
                      >
                        Linen · {brand.count}
                      </span>
                    ) : (
                      <span className={cn("text-xs", isActive ? "text-indigo-200" : "text-slate-400")}>
                        ({brand.count})
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
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
              {filtered.length.toLocaleString()} fabrics
              {canViewPrices ? " · reference price list, not stock" : " · specs only, prices hidden"}
              {" · "}
              <span className="text-slate-600">
                {isSolbiatiTab
                  ? "Click the eye icon in Preview for collection & composition — no swatch images in catalog"
                  : "Click Preview for swatch image (Drapers) or full fabric details"}
              </span>
            </p>
            {solbiatiBrand && solbiatiBrand.count > 0 && !isSolbiatiTab && brandId === "all" ? (
              <p className="mt-1 text-sm text-emerald-700">
                Solbiati linen ({solbiatiBrand.count} fabrics) has its own tab — select{" "}
                <button
                  type="button"
                  onClick={() => setBrandId("solbiati")}
                  className="font-medium underline hover:text-emerald-900"
                >
                  Solbiati
                </button>{" "}
                in the brand list.
              </p>
            ) : null}
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
            { key: "preview", label: "Preview", className: "w-14 px-2" },
            { key: "fabricNo", label: "Fabric No." },
            { key: "composition", label: "Composition" },
            { key: "color", label: "Color" },
            { key: "pattern", label: "Pattern" },
            { key: "text", label: "Text" },
            { key: "weight", label: "Weight" },
            { key: "width", label: "Width" },
          { key: "hsCode", label: "HS Code" },
          { key: "mill", label: "Mill" },
          ...(canViewPrices ? [{ key: "price", label: "List price/m" }] : []),
          ...(showStockColumn ? [{ key: "stock", label: "Stock" }] : []),
          ]}
          rows={sortedDisplay.map((f) => ({
            ...(brandId === "all"
              ? {
                  brand: formatFabricSupplierName(
                    f.supplier_id,
                    f.supplier?.name ?? f.supplier_id,
                    f.fabric_number
                  ),
                }
              : {}),
            preview: (
              <FabricSpecPreview
                fabric={f}
                swatchSrc={
                  f.supplier_id === DRAPERS_SUPPLIER_ID
                    ? drapersSwatchMap.get(f.fabric_number)?.square
                    : undefined
                }
                zoomSrc={
                  f.supplier_id === DRAPERS_SUPPLIER_ID
                    ? drapersSwatchMap.get(f.fabric_number)?.zoom
                    : undefined
                }
                canViewPrices={canViewPrices}
              />
            ),
            fabricNo: <span className="font-mono font-medium">{f.fabric_number}</span>,
            composition: <span className="text-xs">{f.composition ?? "—"}</span>,
            color: f.color ?? "—",
            pattern: formatFabricPatternLabel(f) ?? "—",
            text: formatFabricTextLabel(f) ?? "—",
            weight: f.weight_gsm != null ? `${f.weight_gsm} gsm` : "—",
            width: f.width_cm != null ? `${f.width_cm} cm` : "—",
          hsCode: f.gn_code ? (
            <span className="font-mono text-xs">{f.gn_code}</span>
          ) : "—",
          mill: f.weave_type ? <span className="text-xs">{f.weave_type}</span> : "—",
          ...(canViewPrices
            ? {
                price:
                  f.unit_price != null ? (
                    <DualCurrencyPrice amount={f.unit_price} supplierId={f.supplier_id} unit="m" />
                  ) : (
                    <span className="text-slate-400">—</span>
                  ),
              }
            : {}),
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
