import type { FabricStockStatus } from "@/lib/fabric-sourcing/fabric-stock";
import type { CaccioppoliAvailabilityRow } from "@/lib/integrations/caccioppoli/types";

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

export function normalizeCaccioppoliItemCode(fabricNumber: string): string {
  return fabricNumber.trim().replace(/\s+/g, "");
}

export function caccioppoliItemCandidates(fabricNumber: string): string[] {
  const raw = fabricNumber.trim();
  const normalized = normalizeCaccioppoliItemCode(raw);
  const candidates = [raw, normalized];
  if (/^\d+$/.test(normalized)) {
    candidates.push(normalized.replace(/^0+/, "") || "0");
  }
  return [...new Set(candidates.filter(Boolean))];
}

/** Parse "Available From 30 January 2026" from API info text. */
export function parseCaccioppoliAvailableFromDate(info: string): string | null {
  const match = info.match(/available\s+from\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})/i);
  if (!match) return null;
  const day = Number.parseInt(match[1]!, 10);
  const month = MONTHS[match[2]!.toLowerCase()];
  const year = Number.parseInt(match[3]!, 10);
  if (!month || !day || !year) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function mapCaccioppoliAvailabilityRow(row: CaccioppoliAvailabilityRow): {
  stock_status: FabricStockStatus;
  restock_date: string | null;
  not_found: boolean;
} {
  const stato = row.stato.trim().toUpperCase();

  if (stato === "NE") {
    return { stock_status: "permanently_unavailable", restock_date: null, not_found: true };
  }
  if (stato === "A") {
    return { stock_status: "in_stock", restock_date: null, not_found: false };
  }
  if (stato === "AF") {
    return {
      stock_status: "temp_unavailable",
      restock_date: parseCaccioppoliAvailableFromDate(row.info),
      not_found: false,
    };
  }
  if (stato === "NA" || stato === "X") {
    return { stock_status: "permanently_unavailable", restock_date: null, not_found: false };
  }

  return { stock_status: "permanently_unavailable", restock_date: null, not_found: false };
}
