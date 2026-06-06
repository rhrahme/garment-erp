import floorStations from "@/data/factory-floor-stations.json";
import {
  scanStageStyles,
  type ScanHighlightStage,
} from "@/lib/production/scan-stage-highlight";
import type { ScanStation } from "@/lib/production/stage-scan";

export type FactoryFloorZone = "fabric_receiving" | "production";

export interface FactoryFloorStation {
  id: ScanStation | "packed";
  label: string;
  description: string;
  zone: FactoryFloorZone;
  scan_stage: ScanHighlightStage;
  erp_href: string;
  /** 0–100, from left edge of layout image */
  x: number;
  /** 0–100, from top edge of layout image */
  y: number;
}

export const FACTORY_FLOOR_MAP_IMAGE = floorStations.map_image;
export const FACTORY_FLOOR_MAP_PDF = floorStations.map_pdf;

export const FACTORY_FLOOR_STATIONS: FactoryFloorStation[] = floorStations.stations as FactoryFloorStation[];

export function factoryFloorStationStyle(station: FactoryFloorStation) {
  return scanStageStyles(station.scan_stage);
}

export function factoryFloorStationsByZone(
  zone: FactoryFloorZone | "all",
  stations: FactoryFloorStation[] = FACTORY_FLOOR_STATIONS
): FactoryFloorStation[] {
  if (zone === "all") return stations;
  return stations.filter((s) => s.zone === zone);
}
