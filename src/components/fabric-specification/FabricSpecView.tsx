"use client";

import Link from "next/link";
import { Eye, EyeOff, Printer, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CreateCustomFabricForm } from "@/components/fabric-specification/CreateCustomFabricForm";
import { DownloadLoroPianaMissingSwatchesPdfButton } from "@/components/fabric-specification/DownloadLoroPianaMissingSwatchesPdfButton";
import { EntityPhotos } from "@/components/entity-images/EntityPhotos";
import { FabricSpecPreview } from "@/components/fabric-specification/FabricSpecPreview";
import { DataTable } from "@/components/ui/PageHeader";
import { DualCurrencyPrice } from "@/components/currency/DualCurrencyPrice";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useFabricSpecPricesVisibility } from "@/hooks/useFabricSpecPricesVisibility";
import { useFabricSwatchResolver } from "@/hooks/useFabricSwatchResolver";
import { CUSTOM_SUPPLIER_ID } from "@/lib/types/custom-fabrics";
import {
  expandLoroPianaStyleQuery,
  isLoroPianaStyleSupplier,
  normalizeLoroPianaFabricNumber,
} from "@/lib/fabric-sourcing/loro-piana-styles";
import {
  isRecentlyAddedCustomFabric,
  recentCustomFabricAddedLabel,
} from "@/lib/fabric-sourcing/recent-fabric-highlight";
import { resolveFabricSupplierId } from "@/lib/fabric-sourcing/supplier-aliases";
import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import { formatFabricPatternLabel, formatFabricTextLabel } from "@/lib/fabric-sourcing/fabric-display";
import { fabricStockTone, formatFabricStockLabel } from "@/lib/fabric-sourcing/fabric-stock";
import type { Supplier, SupplierFabric } from "@/lib/types/fabric-sourcing";
import {
  redactSupplierFabricPrice,
  redactSupplierFabricPrices,
} from "@/lib/auth/fabric-price-redact";
import { MASKED_FABRIC_PRICE } from "@/lib/auth/fabric-price.constants";
import { cn } from "@/lib/utils";

interface FabricSpecCatalogSummary {
  brandNames: string[];
  suppliersWithData: number;
  totalItems: number;
  eurToSar: number;
  usdToSar: number;
}

interface FabricSpecViewProps {
  suppliers: Supplier[];
  items: SupplierFabric[];
  canViewPrices?: boolean;
  canViewStock?: boolean;
  /** Admin / QC / task / production / pattern — not sales. */
  canCreateCustomFabric?: boolean;
  catalogSummary?: FabricSpecCatalogSummary;
}

export function FabricSpecView({
  suppliers,
  items: initialItems,
  canViewPrices = false,
  canViewStock = true,
  canCreateCustomFabric = false,
  catalogSummary,
}: FabricSpecViewProps) {
  const [items, setItems] = useState(initialItems);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [nextFabricNumber, setNextFabricNumber] = useState("CF-2026-0001");
  /** After create: offer Print A4 filing sheet with 5x5 cm swatch square. */
  const [lastCreatedFabric, setLastCreatedFabric] = useState<{
    id: string;
    fabric_number: string;
  } | null>(null);
  const {
    visible: pricesVisible,
    unlock: unlockPrices,
    lock: lockPrices,
  } = useFabricSpecPricesVisibility(false);

  /**
   * Eye toggle is the sole client gate for admins. Do NOT use
   * `!hydrated || visible` - that keeps prices forced-on until hydrate and
   * can ignore lock clicks. Default state is hidden until Show is clicked.
   */
  const showPrices = Boolean(canViewPrices && pricesVisible);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  /** When hidden, strip price fields so preview/detail cannot render amounts. */
  const displayItems = useMemo(
    () => (showPrices || !canViewPrices ? items : redactSupplierFabricPrices(items)),
    [items, showPrices, canViewPrices]
  );

  const brandCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of displayItems) {
      const key = resolveFabricSupplierId(item.supplier_id);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [displayItems]);

  const itemsBySupplier = useMemo(() => {
    const map = new Map<string, SupplierFabric[]>();
    for (const item of displayItems) {
      const key = resolveFabricSupplierId(item.supplier_id);
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [displayItems]);

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
  const isCustomTab = brandId === CUSTOM_SUPPLIER_ID;

  useEffect(() => {
    if (!isCustomTab || !canCreateCustomFabric) {
      setShowCreateForm(false);
      return;
    }
    let cancelled = false;
    fetch("/api/custom-fabrics")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.next_fabric_number) return;
        setNextFabricNumber(data.next_fabric_number as string);
      })
      .catch(() => {
        /* keep draft default */
      });
    return () => {
      cancelled = true;
    };
  }, [isCustomTab, canCreateCustomFabric, displayItems]);

  const filtered = useMemo(() => {
    const resolvedBrandId = brandId === "all" ? "all" : resolveFabricSupplierId(brandId);
    let list = resolvedBrandId === "all" ? displayItems : (itemsBySupplier.get(resolvedBrandId) ?? []);
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
            f.source_note?.toLowerCase().includes(q) ||
            f.supplier_name?.toLowerCase().includes(q) ||
            f.client_name?.toLowerCase().includes(q) ||
            f.gn_code?.includes(q)
        );
      }
    }
    return list;
  }, [displayItems, itemsBySupplier, brandId, debouncedQuery]);

  const sortedDisplay = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const brandCmp = (a.supplier?.name ?? "").localeCompare(b.supplier?.name ?? "");
      if (brandCmp !== 0 && brandId === "all") return brandCmp;
      return a.fabric_number.localeCompare(b.fabric_number);
    });
    return sorted.slice(0, 150);
  }, [filtered, brandId]);

  const showStockColumn = useMemo(
    () =>
      canViewStock &&
      filtered.some((fabric) => fabric.stock_status && fabric.stock_status !== "in_stock"),
    [canViewStock, filtered]
  );

  const swatchKeys = useMemo(
    () =>
      sortedDisplay.slice(0, 60).map((f) => ({
        supplier_id: f.supplier_id,
        fabric_number: f.fabric_number,
      })),
    [sortedDisplay]
  );
  const getSwatch = useFabricSwatchResolver(swatchKeys);

  const activeBrand = brands.find((b) => b.id === brandId);
  const isSolbiatiTab = brandId === "solbiati";
  const isLoroPianaStyleTab = isLoroPianaStyleSupplier(brandId);
  const solbiatiBrand = brands.find((b) => b.id === "solbiati");

  function handleCustomFabricCreated(fabric: SupplierFabric) {
    const safeFabric = canViewPrices ? fabric : redactSupplierFabricPrice(fabric);
    setItems((prev) => {
      if (prev.some((row) => row.id === safeFabric.id || row.fabric_number === safeFabric.fabric_number)) {
        return prev;
      }
      return [...prev, safeFabric];
    });
    setShowCreateForm(false);
    setBrandId(CUSTOM_SUPPLIER_ID);
    setLastCreatedFabric({
      id: safeFabric.id,
      fabric_number: safeFabric.fabric_number,
    });
  }

  function handlePriceToggle() {
    if (pricesVisible) lockPrices();
    else unlockPrices();
  }

  return (
    <div>
      {catalogSummary ? (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
          <p className="font-medium">For {catalogSummary.brandNames.join(" & ")}</p>
          <p className="mt-1 text-blue-800">
            {catalogSummary.suppliersWithData} supplier
            {catalogSummary.suppliersWithData !== 1 ? "s" : ""} loaded ·{" "}
            {catalogSummary.totalItems.toLocaleString()} fabric
            {catalogSummary.totalItems !== 1 ? "s" : ""}
            {canViewPrices && showPrices ? (
              <>
                {" "}
                with list prices. Original EUR/USD from supplier lists; SAR shown at book rate EUR 1 = SAR{" "}
                {catalogSummary.eurToSar.toFixed(2)}, USD 1 = SAR {catalogSummary.usdToSar.toFixed(2)}. Order
                via{" "}
                <Link href="/purchasing" className="font-medium underline">
                  Purchasing
                </Link>
                .
              </>
            ) : canViewPrices ? (
              <>
                . Specs only — prices hidden on screen (click Show to reveal).
              </>
            ) : (
              <>
                . Specs only — prices are not shown on your account.
              </>
            )}
            {canViewStock ? (
              <>
                {" "}
                <Link href="/brands" className="font-medium underline">
                  Gliani
                </Link>{" "}
                uses warehouse stock instead — see Inventory.
              </>
            ) : null}
          </p>
        </div>
      ) : null}

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
                  ({displayItems.length})
                </span>
              </button>
            </li>
            {brands.map((brand) => {
              const isSolbiati = brand.id === "solbiati";
              const isCustom = brand.id === CUSTOM_SUPPLIER_ID;
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
                          : isCustom
                            ? "bg-amber-700 text-white"
                            : "bg-indigo-600 text-white"
                        : "text-slate-700 hover:bg-slate-100",
                      brand.count === 0 && !isCustom && "opacity-50",
                      isSolbiati && brand.count > 0 && !isActive && "ring-2 ring-emerald-400/70 ring-offset-1",
                      isCustom && !isActive && "ring-1 ring-amber-300/80"
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
                      ) : isCustom ? (
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            isActive ? "bg-amber-600 text-white" : "bg-amber-100 text-amber-900"
                          )}
                        >
                          One-off · {brand.count}
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
          {canCreateCustomFabric ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setBrandId(CUSTOM_SUPPLIER_ID);
                  setShowCreateForm(true);
                }}
                className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-amber-400 px-3 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50"
              >
                + New fabric
              </button>
              <p className="mt-1.5 px-1 text-[11px] leading-tight text-slate-400">
                Add a one-off fabric (mill leftover, shop buy, client swatch).
              </p>
            </>
          ) : null}
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
                {showPrices ? " · reference price list, not stock" : " · specs only, prices hidden"}
                {" · "}
                <span className="text-slate-600">
                  {isCustomTab
                    ? "Create one-off fabrics (CF-YYYY-####) — mill leftovers, shop buys, client swatches"
                    : isSolbiatiTab
                      ? "Click the Linen badge in Preview for collection & composition — no swatch images in catalog"
                      : "Click Preview for swatch image (Drapers, Loro Piana) or full fabric details"}
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
            <div className="ml-auto flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {canViewPrices ? (
                <button
                  type="button"
                  onClick={handlePriceToggle}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
                  title={showPrices ? "Hide fabric prices" : "Show fabric prices"}
                  aria-label={showPrices ? "Hide fabric prices" : "Show fabric prices"}
                  aria-pressed={showPrices}
                  data-prices-visible={showPrices ? "1" : "0"}
                >
                  {showPrices ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {showPrices ? "Hide" : "Show"}
                </button>
              ) : null}
              {isCustomTab && canCreateCustomFabric ? (
                <button
                  type="button"
                  onClick={() => setShowCreateForm((open) => !open)}
                  className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800"
                >
                  {showCreateForm ? "Hide form" : "Create fabric"}
                </button>
              ) : null}
              {isLoroPianaStyleTab ? <DownloadLoroPianaMissingSwatchesPdfButton /> : null}
              <input
                type="search"
                placeholder="Search fabric no., HS code, color…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-72"
              />
            </div>
          </div>

          {isCustomTab && canCreateCustomFabric && showCreateForm ? (
            <CreateCustomFabricForm
              nextFabricNumber={nextFabricNumber}
              onCreated={handleCustomFabricCreated}
              onCancel={() => setShowCreateForm(false)}
              canViewPrices={showPrices}
            />
          ) : null}

          {isCustomTab && lastCreatedFabric ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm text-emerald-900">
                Saved{" "}
                <span className="font-mono font-semibold">
                  {lastCreatedFabric.fabric_number}
                </span>
                . Print the A4 filing card and attach a 5x5 cm fabric swatch.
              </p>
              <EntityPhotos
                className="mt-2 w-full"
                supplierId={CUSTOM_SUPPLIER_ID}
                fabricNumber={lastCreatedFabric.fabric_number}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/custom-fabrics/${lastCreatedFabric.id}/print`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                >
                  <Printer className="h-4 w-4" />
                  Print A4
                </Link>
                <button
                  type="button"
                  onClick={() => setLastCreatedFabric(null)}
                  className="rounded p-1.5 text-emerald-700 hover:bg-emerald-100"
                  aria-label="Dismiss create notice"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          <DataTable
            key={showPrices ? "prices-on" : "prices-off"}
            columns={[
              ...(brandId === "all" ? [{ key: "brand", label: "Brand" }] : []),
              { key: "fabricNo", label: "Fabric No." },
              { key: "preview", label: "Preview", className: "w-14 px-2" },
              { key: "pattern", label: "Pattern" },
              { key: "text", label: "Text" },
              { key: "composition", label: "Composition" },
              { key: "color", label: "Color" },
              { key: "weight", label: "Weight" },
              { key: "width", label: "Width" },
              { key: "hsCode", label: "HS Code" },
              { key: "mill", label: "Mill" },
              ...(showPrices ? [{ key: "price", label: "Account price/m" }] : []),
              ...(showStockColumn ? [{ key: "stock", label: "Stock" }] : []),
            ]}
            rows={sortedDisplay.map((f) => {
              const isNewCustom = isRecentlyAddedCustomFabric(f);
              return {
              ...(isNewCustom
                ? { rowClassName: "bg-orange-50 hover:bg-orange-100/60" }
                : {}),
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
                    f.swatch_square ?? getSwatch(f.supplier_id, f.fabric_number)?.square
                  }
                  zoomSrc={f.swatch_zoom ?? getSwatch(f.supplier_id, f.fabric_number)?.zoom}
                  canViewPrices={showPrices}
                  canViewStock={canViewStock}
                />
              ),
              fabricNo: (
                  <span className="flex flex-col gap-1">
                  <span className="font-mono font-medium">{f.fabric_number}</span>
                  <EntityPhotos
                    supplierId={f.supplier_id}
                    fabricNumber={f.fabric_number}
                  />
                  {isNewCustom ? (
                    <span className="inline-flex w-fit items-center gap-1 rounded border border-orange-300 bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800">
                      <span className="uppercase tracking-wide">New</span>
                      {recentCustomFabricAddedLabel(f) ? (
                        <span className="font-normal text-orange-700">
                          {recentCustomFabricAddedLabel(f)}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  {f.kind === "custom" || f.supplier_id === CUSTOM_SUPPLIER_ID ? (
                    <Link
                      href={`/custom-fabrics/${f.id}/print`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900"
                    >
                      <Printer className="h-3 w-3" />
                      Print A4
                    </Link>
                  ) : null}
                </span>
              ),
              composition: <span className="text-xs">{f.composition ?? "—"}</span>,
              color: f.color ?? "—",
              pattern: formatFabricPatternLabel(f) ?? "—",
              text: formatFabricTextLabel(f) ?? "—",
              weight: f.weight_gsm != null ? `${f.weight_gsm} gsm` : "—",
              width: f.width_cm != null ? `${f.width_cm} cm` : "—",
              hsCode: f.gn_code ? (
                <span className="font-mono text-xs">{f.gn_code}</span>
              ) : (
                "—"
              ),
              mill: f.weave_type ? <span className="text-xs">{f.weave_type}</span> : "—",
              ...(showPrices
                ? {
                    price:
                      f.unit_price != null ? (
                        <DualCurrencyPrice
                          amount={f.unit_price}
                          supplierId={f.supplier_id}
                          unit="m"
                          currency={f.currency}
                        />
                      ) : (
                        <span className="text-slate-400">{MASKED_FABRIC_PRICE}</span>
                      ),
                  }
                : {}),
              ...(canViewStock
                ? {
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
                  }
                : {}),
              };
            })}
            emptyMessage={
              isCustomTab
                ? canCreateCustomFabric
                  ? showCreateForm
                    ? "Fill the form above to create the first custom fabric."
                    : "No custom fabrics yet — click Create fabric."
                  : "No custom fabrics yet."
                : activeBrand?.count === 0
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
    </div>
  );
}
