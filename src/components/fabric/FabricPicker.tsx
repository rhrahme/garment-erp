"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { FabricSearchItem } from "@/lib/autosave/fabric-search-item";
import { formatSupplierUnitPrice } from "@/lib/currency/format";
import { formatFabricStockLabel } from "@/lib/fabric-sourcing/fabric-stock";
import {
  isLoroPianaStyleSupplier,
  resolveLoroPianaFabricInput,
} from "@/lib/fabric-sourcing/loro-piana-styles";
import { normalizeFabricSupplierFields } from "@/lib/fabric-sourcing/supplier-display";

function formatWidth(line: { width_cm?: number | null; width_inches?: number | null }) {
  if (line.width_cm != null) return `${line.width_cm} cm`;
  if (line.width_inches != null) return `${line.width_inches}"`;
  return "—";
}

function formatLinePrice(line: { supplier_id: string; unit_price: number | null; unit: string }) {
  if (line.unit_price == null) return "—";
  return formatSupplierUnitPrice(line.unit_price, line.supplier_id, line.unit);
}

export function FabricPicker({
  brandName,
  supplierId,
  value,
  onChange,
  onSelect,
  canViewFabricPrices = true,
  allowManualEntry = true,
  label = "Fabric",
  inputClassName = "w-full min-h-[44px] rounded-lg border border-slate-300 bg-white py-2.5 pl-3 pr-10 text-base sm:text-sm",
}: {
  brandName: string;
  supplierId: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: FabricSearchItem) => void;
  canViewFabricPrices?: boolean;
  /** When false, unknown fabric numbers cannot be added without a catalog match. */
  allowManualEntry?: boolean;
  label?: string;
  inputClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [fabrics, setFabrics] = useState<FabricSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!supplierId || !open) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          supplier_id: supplierId,
          q: value.trim(),
          limit: "60",
        });
        const res = await fetch(`/api/fabric-search?${params}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { items: FabricSearchItem[] };
        if (!cancelled) setFabrics(data.items);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, value.trim() ? 200 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, supplierId, value]);

  useEffect(() => {
    setFabrics([]);
    setOpen(Boolean(supplierId));
  }, [supplierId]);

  function fabricLookupKey(fabricNumber: string) {
    return isLoroPianaStyleSupplier(supplierId)
      ? resolveLoroPianaFabricInput(fabricNumber).preferredNumber.toLowerCase()
      : fabricNumber.toLowerCase();
  }

  function hasExactMatch(items: FabricSearchItem[], fabricNumber: string) {
    const lookup = fabricLookupKey(fabricNumber);
    return items.some((item) => item.fabric_number.toLowerCase() === lookup);
  }

  function manualEntryLabel(fabricNumber: string) {
    return isLoroPianaStyleSupplier(supplierId)
      ? resolveLoroPianaFabricInput(fabricNumber).preferredNumber
      : fabricNumber;
  }

  function ManualEntryButton({ fabricNumber }: { fabricNumber: string }) {
    const label = manualEntryLabel(fabricNumber);
    return (
      <button
        type="button"
        onClick={() => selectManualFabric(fabricNumber)}
        className="font-medium text-indigo-600 hover:text-indigo-700"
      >
        Add {label} manually →
      </button>
    );
  }

  function selectManualFabric(fabricNumber: string) {
    const resolved = isLoroPianaStyleSupplier(supplierId)
      ? resolveLoroPianaFabricInput(fabricNumber)
      : { preferredNumber: fabricNumber.trim(), millLine: null as "loro_piana" | "solbiati" | null };
    if (
      isLoroPianaStyleSupplier(supplierId) &&
      ((supplierId === "solbiati" && resolved.millLine !== "solbiati") ||
        (supplierId === "loro-piana" && resolved.millLine !== "loro_piana"))
    ) {
      return;
    }
    const normalized = normalizeFabricSupplierFields(supplierId, brandName, resolved.preferredNumber);
    onSelect({
      id: `manual-${normalized.supplier_id}-${resolved.preferredNumber.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      supplier_id: normalized.supplier_id,
      supplier_name: normalized.supplier_name,
      fabric_number: resolved.preferredNumber,
      composition: null,
      color: null,
      weight_gsm: null,
      width_cm: null,
      width_inches: null,
      unit_price: null,
      unit: "meters",
      mill_line: resolved.millLine,
      manual: true,
    });
    onChange(resolved.preferredNumber);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <div className="relative mt-1">
          <input
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) {
                e.preventDefault();
                const match = fabrics.find(
                  (item) => item.fabric_number.toLowerCase() === fabricLookupKey(value.trim())
                );
                if (match) {
                  onSelect(match);
                  onChange(match.fabric_number);
                  setOpen(false);
                } else if (allowManualEntry) {
                  selectManualFabric(value.trim());
                }
              }
            }}
            placeholder={`Type or select ${brandName} fabric…`}
            className={inputClassName}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-slate-400 hover:text-slate-600"
            aria-label="Toggle fabric list"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </label>

      {open && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading ? (
            <p className="px-4 py-3 text-sm text-slate-500">Loading fabrics…</p>
          ) : fabrics.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500">
              {value.trim() ? (
                allowManualEntry ? (
                  <>
                    <p>Not in the {brandName} price list.</p>
                    <div className="mt-2">
                      <ManualEntryButton fabricNumber={value.trim()} />
                    </div>
                    {supplierId === "solbiati" && /^\d{4,5}$/.test(value.trim()) && (
                      <p className="mt-2 text-xs text-slate-400">
                        Solbiati linen codes use S + 5 digits — saved as S{value.trim()} (e.g. S23021).
                      </p>
                    )}
                    {supplierId === "loro-piana" && /^\d{4,5}$/.test(value.trim()) && (
                      <p className="mt-2 text-xs text-slate-400">
                        Loro Piana wool/cashmere uses 6 digits (e.g. 781050). For Solbiati linen, select the Solbiati
                        brand.
                      </p>
                    )}
                  </>
                ) : (
                  <p>No match in the {brandName} price list — pick a fabric from the list or adjust your search.</p>
                )
              ) : supplierId === "solbiati" ? (
                "Solbiati linen — S-prefix (S23021) or type 23021"
              ) : supplierId === "loro-piana" ? (
                "Loro Piana — 6-digit codes (e.g. 781050)"
              ) : (
                "Loading catalog…"
              )}
            </div>
          ) : (
            <>
              <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-400">
                {value.trim()
                  ? `${fabrics.length} match${fabrics.length !== 1 ? "es" : ""}`
                  : `Showing first ${fabrics.length} — type to filter`}
              </p>
              <ul className="max-h-64 overflow-y-auto">
                {fabrics.map((item) => {
                  const soldOut = item.stock_status === "permanently_unavailable";
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(item);
                          onChange(item.fabric_number);
                          setOpen(false);
                        }}
                        className={`flex w-full flex-col gap-0.5 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 last:border-0 ${
                          soldOut ? "bg-red-50/40" : ""
                        }`}
                      >
                        <span className="font-mono font-medium text-slate-900">
                          {item.fabric_number}
                          {item.manual ? (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-sans font-medium uppercase tracking-wide text-amber-800">
                              Manual
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs text-slate-500">
                          {item.manual
                            ? "Manual entry — specs can be filled when the price list is imported"
                            : [
                                item.composition ?? "—",
                                item.weight_gsm != null ? `${item.weight_gsm} gsm` : null,
                                formatWidth(item) !== "—" ? formatWidth(item) : null,
                                canViewFabricPrices && item.unit_price != null ? formatLinePrice(item) : null,
                                formatFabricStockLabel(item),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {value.trim() && allowManualEntry && !hasExactMatch(fabrics, value.trim()) && (
                <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
                  <p>No exact match for &ldquo;{manualEntryLabel(value.trim())}&rdquo;.</p>
                  <div className="mt-2">
                    <ManualEntryButton fabricNumber={value.trim()} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
