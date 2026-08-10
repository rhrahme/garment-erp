"use client";

import { CopySizesForm } from "@/components/pattern/library/CopySizesForm";

/**
 * Tab panel: push this sheet's sizes onto other same-client + same-garment
 * consolidation sheets (different fabric / composition groups).
 */
export function CopySizesToConsolidationsPanel({
  patternId,
  patternRef,
  garmentType,
  dirty,
  defaultPieceScope,
}: {
  patternId: string;
  patternRef: string;
  garmentType?: string | null;
  /** Warn Pattern to save the open sheet before copying. */
  dirty: boolean;
  defaultPieceScope?: string | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <CopySizesForm
        patternId={patternId}
        patternRef={patternRef}
        garmentType={garmentType}
        dirty={dirty}
        defaultPieceScope={defaultPieceScope}
      />
    </div>
  );
}
