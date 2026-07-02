import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import { formatFabricLineLabels } from "@/lib/sales-orders/label-display";
import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";

export type FabricLineSortKey =
  | "article"
  | "fabric"
  | "garment"
  | "labels"
  | "composition"
  | "weight"
  | "width"
  | "meters"
  | "price"
  | "supplier";

export type SortDirection = "asc" | "desc";

export type FabricLineSortState = {
  key: FabricLineSortKey;
  direction: SortDirection;
};

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function compareNullableNumbers(a: number | null | undefined, b: number | null | undefined): number {
  const aMissing = a == null || !Number.isFinite(a);
  const bMissing = b == null || !Number.isFinite(b);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return a - b;
}

function lineWidth(line: SalesOrderFabricLine): number | null {
  if (line.width_cm != null) return line.width_cm;
  if (line.width_inches != null) return line.width_inches;
  return null;
}

export function compareFabricLines(
  a: SalesOrderFabricLine,
  b: SalesOrderFabricLine,
  key: FabricLineSortKey,
  articleByLineId: Map<string, number>
): number {
  switch (key) {
    case "article":
      return compareNullableNumbers(articleByLineId.get(a.id), articleByLineId.get(b.id));
    case "fabric":
      return compareStrings(a.fabric_number, b.fabric_number);
    case "garment":
      return compareStrings(a.garment_type, b.garment_type);
    case "labels":
      return compareStrings(formatFabricLineLabels(a), formatFabricLineLabels(b));
    case "composition":
      return compareStrings(a.composition ?? "", b.composition ?? "");
    case "weight":
      return compareNullableNumbers(a.weight_gsm, b.weight_gsm);
    case "width":
      return compareNullableNumbers(lineWidth(a), lineWidth(b));
    case "meters":
      return compareNullableNumbers(a.quantity, b.quantity);
    case "price":
      return compareNullableNumbers(a.unit_price, b.unit_price);
    case "supplier":
      return compareStrings(
        formatFabricSupplierName(a.supplier_id, a.supplier_name, a.fabric_number),
        formatFabricSupplierName(b.supplier_id, b.supplier_name, b.fabric_number)
      );
    default:
      return 0;
  }
}

export function sortFabricLines(
  lines: SalesOrderFabricLine[],
  sort: FabricLineSortState | null,
  articleByLineId: Map<string, number>
): SalesOrderFabricLine[] {
  if (!sort) return lines;

  const direction = sort.direction === "asc" ? 1 : -1;
  return [...lines].sort((a, b) => {
    const cmp = compareFabricLines(a, b, sort.key, articleByLineId);
    if (cmp !== 0) return cmp * direction;
    return compareFabricLines(a, b, "article", articleByLineId) * direction;
  });
}

export function nextFabricLineSort(
  current: FabricLineSortState | null,
  key: FabricLineSortKey
): FabricLineSortState {
  if (current?.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: "asc" };
}
