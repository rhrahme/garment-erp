"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_LABEL_ROTATION,
  readLabelRotation,
  writeLabelRotation,
  type LabelPrintMode,
} from "@/lib/production/label-printer-settings";

/** Persisted label print mode for thermal sticker PDFs (browser localStorage). */
export function useLabelRotation() {
  const [rotation, setRotationState] = useState<LabelPrintMode>(DEFAULT_LABEL_ROTATION);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setRotationState(readLabelRotation());
    setHydrated(true);
  }, []);

  const setRotation = useCallback((next: LabelPrintMode) => {
    setRotationState(next);
    writeLabelRotation(next);
  }, []);

  return { rotation, setRotation, hydrated };
}
