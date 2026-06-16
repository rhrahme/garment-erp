"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FACTORY_WORKSTATIONS,
  normalizeWorkstationId,
  type FactoryWorkstation,
} from "@/lib/production/factory-workstations";

const STORAGE_KEY = "garment-erp-factory-workstation-positions";

type PositionOverride = Record<string, { x: number; y: number }>;

function readOverrides(): PositionOverride {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PositionOverride;
    const migrated: PositionOverride = {};
    for (const [key, value] of Object.entries(parsed)) {
      const normalized = normalizeWorkstationId(key);
      migrated[normalized ?? key] = value;
    }
    return migrated;
  } catch {
    return {};
  }
}

export function useFactoryWorkstationPositions() {
  const [workstations, setWorkstations] = useState<FactoryWorkstation[]>(FACTORY_WORKSTATIONS);
  const [dirty, setDirty] = useState(false);
  const [hasBrowserOverrides, setHasBrowserOverrides] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPositions() {
      const overrides = readOverrides();
      setHasBrowserOverrides(Object.keys(overrides).length > 0);

      let base = FACTORY_WORKSTATIONS;
      try {
        const res = await fetch("/api/factory/workstations");
        if (res.ok) {
          const data = (await res.json()) as { workstations?: FactoryWorkstation[] };
          if (data.workstations?.length) base = data.workstations;
        }
      } catch {
        // Fall back to bundled defaults when the API is unavailable.
      }

      if (cancelled) return;

      const merged = base.map((ws) => {
        const override = overrides[ws.id];
        if (!override) return ws;
        return { ...ws, x: override.x, y: override.y };
      });
      setWorkstations(merged);
    }

    void loadPositions();
    return () => {
      cancelled = true;
    };
  }, []);

  const updatePosition = useCallback((id: string, x: number, y: number) => {
    const clampedX = Math.min(98, Math.max(2, Math.round(x * 10) / 10));
    const clampedY = Math.min(98, Math.max(2, Math.round(y * 10) / 10));
    setWorkstations((prev) =>
      prev.map((ws) => (ws.id === id ? { ...ws, x: clampedX, y: clampedY } : ws))
    );
    setDirty(true);
  }, []);

  const saveToBrowser = useCallback(() => {
    const overrides: PositionOverride = Object.fromEntries(
      workstations.map((ws) => [ws.id, { x: ws.x, y: ws.y }])
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    setHasBrowserOverrides(true);
    setDirty(false);
  }, [workstations]);

  const resetToDefaults = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setWorkstations(FACTORY_WORKSTATIONS);
    setHasBrowserOverrides(false);
    setDirty(false);
  }, []);

  const positionOverrides = useMemo(
    () => Object.fromEntries(workstations.map((ws) => [ws.id, { x: ws.x, y: ws.y }])),
    [workstations]
  );

  return {
    workstations,
    updatePosition,
    saveToBrowser,
    resetToDefaults,
    dirty,
    hasBrowserOverrides,
    positionOverrides,
  };
}
