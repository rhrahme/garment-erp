"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_LABEL_SCALE_PCT,
  readLabelScalePct,
  writeLabelScalePct,
  type LabelScalePct,
} from "@/lib/production/label-printer-settings";

/** Persisted label content scale for thermal sticker PDFs (browser localStorage). */
export function useLabelScale() {
  const [scalePct, setScalePctState] = useState<LabelScalePct>(DEFAULT_LABEL_SCALE_PCT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setScalePctState(readLabelScalePct());
    setHydrated(true);
  }, []);

  const setScalePct = useCallback((next: LabelScalePct) => {
    setScalePctState(next);
    writeLabelScalePct(next);
  }, []);

  return { scalePct, setScalePct, hydrated };
}
