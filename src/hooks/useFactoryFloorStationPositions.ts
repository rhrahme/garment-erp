"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FACTORY_FLOOR_STATIONS,
  type FactoryFloorStation,
} from "@/lib/production/factory-floor-stations";

const STORAGE_KEY = "garment-erp-factory-floor-positions";

type PositionOverride = Record<string, { x: number; y: number }>;

function readOverrides(): PositionOverride {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PositionOverride;
  } catch {
    return {};
  }
}

function mergeStations(overrides: PositionOverride): FactoryFloorStation[] {
  return FACTORY_FLOOR_STATIONS.map((station) => {
    const override = overrides[station.id];
    if (!override) return station;
    return { ...station, x: override.x, y: override.y };
  });
}

export function useFactoryFloorStationPositions() {
  const [stations, setStations] = useState<FactoryFloorStation[]>(FACTORY_FLOOR_STATIONS);
  const [dirty, setDirty] = useState(false);
  const [hasBrowserOverrides, setHasBrowserOverrides] = useState(false);

  useEffect(() => {
    const overrides = readOverrides();
    setHasBrowserOverrides(Object.keys(overrides).length > 0);
    setStations(mergeStations(overrides));
  }, []);

  const updatePosition = useCallback((id: string, x: number, y: number) => {
    const clampedX = Math.min(98, Math.max(2, Math.round(x * 10) / 10));
    const clampedY = Math.min(98, Math.max(2, Math.round(y * 10) / 10));
    setStations((prev) =>
      prev.map((station) =>
        station.id === id ? { ...station, x: clampedX, y: clampedY } : station
      )
    );
    setDirty(true);
  }, []);

  const saveToBrowser = useCallback(() => {
    const overrides: PositionOverride = Object.fromEntries(
      stations.map((station) => [station.id, { x: station.x, y: station.y }])
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    setHasBrowserOverrides(true);
    setDirty(false);
  }, [stations]);

  const resetToDefaults = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setStations(FACTORY_FLOOR_STATIONS);
    setHasBrowserOverrides(false);
    setDirty(false);
  }, []);

  const positionOverrides = useMemo(
    () => Object.fromEntries(stations.map((s) => [s.id, { x: s.x, y: s.y }])),
    [stations]
  );

  return {
    stations,
    updatePosition,
    saveToBrowser,
    resetToDefaults,
    dirty,
    hasBrowserOverrides,
    positionOverrides,
  };
}
