"use client";

import { useMemo, useState } from "react";
import { DrapersFabricSwatch } from "@/components/fabric-specification/DrapersFabricSwatch";
import { DataTable } from "@/components/ui/PageHeader";
import { DualCurrencyPrice } from "@/components/currency/DualCurrencyPrice";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useDrapersSwatchMap } from "@/hooks/useDrapersSwatchMap";
import { DRAPERS_SUPPLIER_ID } from "@/lib/integrations/drapers/config";
import { expandLoroPianaStyleQuery, normalizeLoroPianaFabricNumber } from "@/lib/fabric-sourcing/loro-piana-styles";
import { resolveFabricSupplierId } from "@/lib/fabric-sourcing/supplier-aliases";
import { formatFabricSupplierName, isSolbiatiFabric } from "@/lib/fabric-sourcing/supplier-display";
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
      const lookup =
        brandId === "loro-piana" || brandId === "all"
          ? normalizeLoroPianaFabricNumber(search).toLowerCase()
          : q;
      const rangeNumbers =
        brandId === "loro-piana" || brandId === "all"
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

  const showMillLineColumn =
    brandId === "loro-piana" ||
    (brandId === "all" && (itemsBySupplier.get("loro-piana")?.length ?? 0) > 0);

  const showDrapersSwatch =
    brandId === DRAPERS_SUPPLIER_ID ||
    (brandId === "all" && sortedDisplay.some((f) => f.supplier_id === DRAPERS_SUPPLIER_ID));

  const drapersFabricNumbers = useMemo(
    () =>
      showDrapersSwatch
        ? sortedDisplay
            .filter((f) => f.supplier_id === DRAPERS_SUPPLIER_ID)
            .map((f) => f.fabric_number)
            .slice(0, 60)
        : [],
    [showDrapersSwatch, sortedDisplay]
  );

  const drapersSwatchMap = useDrapersSwatchMap(drapersFabricNumbers);

  const activeBrand = brands.find((b) => b.id === brandId);

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
              {filtered.length.toLocaleString()} fabrics
              {canViewPrices ? " · reference price list, not stock" : " · specs only, prices hidden"}
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
            ...(showDrapersSwatch ? [{ key: "swatch", label: "", className: "w-10 px-2" }] : []),
            ...(showMillLineColumn ? [{ key: "millLine", label: "Line" }] : []),
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
            ...(showDrapersSwatch
              ? {
                  swatch:
                    f.supplier_id === DRAPERS_SUPPLIER_ID ? (
                      <DrapersFabricSwatch
                        fabricNumber={f.fabric_number}
                        src={drapersSwatchMap.get(f.fabric_number)?.square}
                        zoomSrc={drapersSwatchMap.get(f.fabric_number)?.zoom}
                      />
                    ) : (
                      <span className="inline-block h-7 w-7" aria-hidden />
                    ),
                }
              : {}),
            ...(showMillLineColumn
              ? {
                  millLine: isSolbiatiFabric(f.supplier_id, f.fabric_number) ? (
                    <span className="font-medium text-amber-900">Solbiati</span>
                  ) : f.supplier_id === "loro-piana" ? (
                    "Loro Piana"
                  ) : (
                    "—"
                  ),
                }
              : {}),
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
