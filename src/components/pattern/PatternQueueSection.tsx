"use client";

import { FactoryBrandTabs } from "@/components/brands/FactoryBrandTabs";
import { PatternWorkList } from "@/components/pattern/PatternWorkList";
import { WashedReadyPanel } from "@/components/pattern/library/WashedReadyPanel";
import { useFactoryBrandFilter } from "@/hooks/useFactoryBrandFilter";

/** Shared brand filter for the Pattern home queue + washed-ready panel. */
export function PatternQueueSection() {
  const { brandId, setBrandId, hydrated } = useFactoryBrandFilter();

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
      <WashedReadyPanel brandId={brandId} />
      <PatternWorkList brandId={brandId} hideBrandTabs />
    </div>
  );
}
