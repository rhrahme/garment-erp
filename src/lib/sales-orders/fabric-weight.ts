import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";

function lineWidthMeters(line: SalesOrderFabricLine): number | null {
  if (line.width_cm != null) return line.width_cm / 100;
  if (line.width_inches != null) return line.width_inches * 0.0254;
  return null;
}

/** Fabric weight in kg from meters × width × gsm. */
export function fabricLineWeightKg(line: SalesOrderFabricLine): number | null {
  if (line.weight_gsm == null) return null;
  const widthM = lineWidthMeters(line);
  if (widthM == null) return null;
  const lengthM = line.unit === "meters" || line.unit === "m" ? line.quantity : null;
  if (lengthM == null || !Number.isFinite(lengthM) || lengthM <= 0) return null;
  return (lengthM * widthM * line.weight_gsm) / 1000;
}

export function totalFabricWeightKg(lines: SalesOrderFabricLine[]): number | null {
  let total = 0;
  let counted = 0;
  for (const line of lines) {
    const kg = fabricLineWeightKg(line);
    if (kg == null) continue;
    total += kg;
    counted += 1;
  }
  return counted > 0 ? total : null;
}

export function formatTotalFabricWeightKg(lines: SalesOrderFabricLine[]): string | null {
  const total = totalFabricWeightKg(lines);
  if (total == null) return null;
  return `${total.toFixed(1)} kg`;
}

export function totalFabricMeters(lines: SalesOrderFabricLine[]): number {
  return lines.reduce((sum, line) => {
    if (line.unit === "meters" || line.unit === "m") return sum + line.quantity;
    return sum;
  }, 0);
}

export function fabricLinesWithWeightCount(lines: SalesOrderFabricLine[]): number {
  return lines.filter((line) => fabricLineWeightKg(line) != null).length;
}

export interface FabricTotalsSummary {
  line_count: number;
  total_meters: number;
  total_kg: number | null;
  weighed_line_count: number;
}

export function getFabricTotalsSummary(lines: SalesOrderFabricLine[]): FabricTotalsSummary {
  return {
    line_count: lines.length,
    total_meters: totalFabricMeters(lines),
    total_kg: totalFabricWeightKg(lines),
    weighed_line_count: fabricLinesWithWeightCount(lines),
  };
}
