import floorStations from "@/data/factory-floor-stations.json";
import {
  scanStageStyles,
  type ScanHighlightStage,
} from "@/lib/production/scan-stage-highlight";
import type { ScanStation } from "@/lib/production/stage-scan";

export type FactoryFloorZone = "fabric_receiving" | "production" | "production_line";

export interface FactoryFloorScanStation {
  id: ScanStation | "packed";
  label: string;
  description: string;
  zone: "fabric_receiving" | "production";
  scan_stage: ScanHighlightStage;
  erp_href: string;
  /** 0–100, from left edge of layout image */
  x: number;
  /** 0–100, from top edge of layout image */
  y: number;
}

export interface FactoryFloorProductionLine {
  id: `line-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
  label: string;
  description: string;
  zone: "production_line";
  line_number: number;
  /** 0–100, from left edge of layout image */
  x: number;
  /** 0–100, from top edge of layout image */
  y: number;
}

export type FactoryFloorStation = FactoryFloorScanStation | FactoryFloorProductionLine;

export const FACTORY_FLOOR_MAP_IMAGE = floorStations.map_image;
export const FACTORY_FLOOR_MAP_PDF = floorStations.map_pdf;

export const FACTORY_FLOOR_STATIONS: FactoryFloorStation[] = floorStations.stations as FactoryFloorStation[];

export const PRODUCTION_LINE_STYLE = {
  chip: "bg-slate-800 text-white",
  pin: "bg-slate-800 text-white border-white",
  label: "PL",
} as const;

export function isProductionLineStation(
  station: FactoryFloorStation
): station is FactoryFloorProductionLine {
  return station.zone === "production_line";
}

export function factoryFloorStationStyle(station: FactoryFloorStation) {
  if (isProductionLineStation(station)) return PRODUCTION_LINE_STYLE;
  return scanStageStyles(station.scan_stage);
}

export function factoryFloorStationsByZone(
  zone: FactoryFloorZone | "all",
  stations: FactoryFloorStation[] = FACTORY_FLOOR_STATIONS
): FactoryFloorStation[] {
  if (zone === "all") return stations;
  return stations.filter((s) => s.zone === zone);
}
