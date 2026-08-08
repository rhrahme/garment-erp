"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_MEASUREMENT_UNIT,
  MEASUREMENT_UNIT_PREF_KEY,
  parseMeasurementUnit,
  readMeasurementUnitPreference,
  writeMeasurementUnitPreference,
} from "@/lib/pattern-library/measurement-unit-preference";
import type { MeasurementUnit } from "@/lib/types/pattern-library";

const CHANGE_EVENT = "erp-measurement-unit-change";

/**
 * Site-wide Pattern measurement unit (cm | inches). Persisted in localStorage
 * and synced across open Pattern tabs/components in this browser.
 */
export function useMeasurementUnitPreference() {
  const [unit, setUnitState] = useState<MeasurementUnit>(DEFAULT_MEASUREMENT_UNIT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setUnitState(readMeasurementUnitPreference());
    setHydrated(true);

    function onStorage(event: StorageEvent) {
      if (event.key !== MEASUREMENT_UNIT_PREF_KEY) return;
      setUnitState(parseMeasurementUnit(event.newValue) ?? DEFAULT_MEASUREMENT_UNIT);
    }
    function onLocal() {
      setUnitState(readMeasurementUnitPreference());
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onLocal);
    };
  }, []);

  const setUnit = useCallback((next: MeasurementUnit) => {
    writeMeasurementUnitPreference(next);
    setUnitState(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { unit, setUnit, hydrated };
}
