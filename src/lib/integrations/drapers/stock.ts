import type { FabricStockStatus } from "@/lib/fabric-sourcing/fabric-stock";
import type { DrapersStockRow } from "@/lib/integrations/drapers/types";

/** Parses Drapers decimal strings (e.g. "73,20" or "1.234,50"). */
export function parseDrapersDecimal(value: string): number {
  return parseDrapersQuantityMeters(value);
}

export function parseDrapersQuantityMeters(quantity: string): number {
  const normalized = quantity.trim().replace(/\s/g, "");
  if (!normalized) return 0;
  if (normalized.includes(",") && normalized.includes(".")) {
    return Number.parseFloat(normalized.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return Number.parseFloat(normalized.replace(",", ".")) || 0;
}

export function normalizeDrapersFabricCode(fabricNumber: string): string {
  return fabricNumber.trim().replace(/\s+/g, "").replace(/^DP/i, "");
}

export function drapersFabricCodeCandidates(fabricNumber: string): string[] {
  const raw = fabricNumber.trim();
  const stripped = normalizeDrapersFabricCode(raw);
  const candidates = [raw, stripped];
  if (/^\d+$/.test(stripped)) {
    candidates.push(stripped.replace(/^0+/, "") || "0");
  }
  return [...new Set(candidates.filter(Boolean))];
}

function parseRestockDate(restock: string | null): string | null {
  if (!restock?.trim()) return null;
  const trimmed = restock.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const eu = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (eu) {
    const [, d, m, y] = eu;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  return trimmed;
}

export function mapDrapersStockRow(row: DrapersStockRow): {
  stock_status: FabricStockStatus;
  restock_date: string | null;
  quantity_meters: number;
} {
  const quantity_meters = parseDrapersQuantityMeters(row.quantity);
  const restock_date = parseRestockDate(row.restock_date);

  if (row.in_stock) {
    return { stock_status: "in_stock", restock_date: null, quantity_meters };
  }
  if (row.in_restock || restock_date) {
    return { stock_status: "temp_unavailable", restock_date, quantity_meters };
  }
  return { stock_status: "permanently_unavailable", restock_date: null, quantity_meters };
}
