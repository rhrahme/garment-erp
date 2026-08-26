"use client";

import { FactoryBrandTabs } from "@/components/brands/FactoryBrandTabs";
import { PatternWorkList } from "@/components/pattern/PatternWorkList";
import { WashedReadyPanel } from "@/components/pattern/library/WashedReadyPanel";
import { useFactoryBrandFilter } from "@/hooks/useFactoryBrandFilter";
import { getFactoryBrandById } from "@/lib/data/factory-brands";

/** Shared brand filter for the Pattern home queue + washed-ready panel. */
export function PatternQueueSection() {
  // Do not restore last week's Gilani/FR chip from localStorage. Both Pattern
  // logins share one queue; a leftover brand filter made Pattern 2 see New (8)
  // while Mohtajul saw New (51).
  const { brandId, setBrandId, hydrated } = useFactoryBrandFilter(null, {
    persist: false,
  });
  const filteredBrand = brandId ? getFactoryBrandById(brandId) : null;

  return (
    <div className="space-y-4">
      {hydrated ? (
        <FactoryBrandTabs
          value={brandId}
          onChange={setBrandId}
          showAll
          allLabel="All brands"
          label="Filter by brand"
        />
      ) : null}
      {filteredBrand ? (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">
            Showing {filteredBrand.name} only. Both Pattern logins share the same full list.
          </p>
          <button
            type="button"
            onClick={() => setBrandId(null)}
            className="mt-2 rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-900"
          >
            Show all brands
          </button>
        </div>
      ) : null}
      <WashedReadyPanel brandId={brandId} />
      <PatternWorkList brandId={brandId} hideBrandTabs onBrandIdChange={setBrandId} />
    </div>
  );
}
