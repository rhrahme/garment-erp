import workstationsData from "@/data/factory-workstations.json";

/** Production line label — e.g. PL1 (production line 1). */
export function productionLineLabel(lineNumber: number): string {
  return `PL${lineNumber}`;
}

/** Stable workstation / machine ID — e.g. PL-1-1 (line 1, machine 1). */
export function workstationId(lineNumber: number, stationNumber: number): string {
  return `PL-${lineNumber}-${stationNumber}`;
}

function parseWorkstationParts(lineNumber: number, stationNumber: number): { lineNumber: number; stationNumber: number } | null {
  if (!Number.isFinite(lineNumber) || !Number.isFinite(stationNumber)) return null;
  if (lineNumber < 1 || lineNumber > 8 || stationNumber < 1 || stationNumber > 9) return null;
  return { lineNumber, stationNumber };
}

/** Accepts canonical PL-{line}-{machine} and legacy L{line}-W{machine} IDs. */
export function parseWorkstationId(id: string): { lineNumber: number; stationNumber: number } | null {
  const trimmed = id.trim();
  const canonical = /^PL-(\d+)-(\d+)$/i.exec(trimmed);
  if (canonical) {
    return parseWorkstationParts(Number(canonical[1]), Number(canonical[2]));
  }
  const legacy = /^L(\d+)-W(\d{2})$/i.exec(trimmed);
  if (legacy) {
    return parseWorkstationParts(Number(legacy[1]), Number(legacy[2]));
  }
  return null;
}

/** Canonical PL-{line}-{machine} ID, or null when unrecognised. */
export function normalizeWorkstationId(id: string): string | null {
  const parsed = parseWorkstationId(id);
  if (!parsed) return null;
  return workstationId(parsed.lineNumber, parsed.stationNumber);
}

export function workstationLabel(lineNumber: number, stationNumber: number): string {
  return `${productionLineLabel(lineNumber)} · Machine ${stationNumber}`;
}

export function workstationScanUrl(id: string, baseUrl?: string): string {
  const normalized = id.trim().toUpperCase();
  const appUrl = (baseUrl ?? process.env.NEXT_PUBLIC_APP_URL?.trim()) || "https://erp.hagan.pro";
  return `${appUrl.replace(/\/$/, "")}/production/workstation/${encodeURIComponent(normalized)}`;
}

/** Vertical spread within the sewing block — table 1 near receive flow (top). */
export function defaultStationY(stationNumber: number): number {
  return Math.round((35 + (stationNumber - 1) * (30 / 8)) * 10) / 10;
}

/** Line column x positions (% from left) — matches factory-floor-stations.json. */
export const PRODUCTION_LINE_X: Record<number, number> = {
  1: 48,
  2: 54,
  3: 60,
  4: 66,
  5: 71,
  6: 77,
  7: 83,
  8: 89,
};

export interface FactoryWorkstation {
  id: string;
  line_number: number;
  station_number: number;
  label: string;
  /** 0–100, from left edge of layout image */
  x: number;
  /** 0–100, from top edge of layout image */
  y: number;
}

export function buildDefaultWorkstations(): FactoryWorkstation[] {
  const items: FactoryWorkstation[] = [];
  for (let lineNumber = 1; lineNumber <= 8; lineNumber += 1) {
    for (let stationNumber = 1; stationNumber <= 9; stationNumber += 1) {
      const id = workstationId(lineNumber, stationNumber);
      items.push({
        id,
        line_number: lineNumber,
        station_number: stationNumber,
        label: workstationLabel(lineNumber, stationNumber),
        x: PRODUCTION_LINE_X[lineNumber] ?? 50,
        y: defaultStationY(stationNumber),
      });
    }
  }
  return items;
}

export const FACTORY_WORKSTATIONS: FactoryWorkstation[] =
  workstationsData.workstations as FactoryWorkstation[];

export function getWorkstationById(id: string): FactoryWorkstation | undefined {
  const normalized = normalizeWorkstationId(id);
  if (!normalized) return undefined;
  return FACTORY_WORKSTATIONS.find((ws) => ws.id.toUpperCase() === normalized.toUpperCase());
}
