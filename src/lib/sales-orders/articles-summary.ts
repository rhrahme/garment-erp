import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import {
  buildSoArticleMapFromFabricLines,
  formatFabricLineArticle,
  formatGarmentWithPieceList,
  piecesForFabricLine,
} from "@/lib/sales-orders/label-codes";
import { fabricLineWeightKg, totalFabricMeters, totalFabricWeightKg } from "@/lib/sales-orders/fabric-weight";
import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";

export interface ArticleLineSummary {
  line_id: string;
  article_number: number;
  article_label: string;
  garment_type: string;
  /** Ordered pieces under the line (Jacket, Trouser for Suit). */
  pieces: string[];
  /** Parent + pieces label for display, e.g. Suit (Jacket + Trouser). */
  garment_label: string;
  fabric_number: string;
  supplier_label: string;
  meters: number;
  kg: number | null;
}

export interface QuantityAggregate {
  label: string;
  line_count: number;
  total_meters: number;
}

export interface SalesOrderArticlesSummary {
  lines: ArticleLineSummary[];
  by_garment: QuantityAggregate[];
  by_supplier: QuantityAggregate[];
  total_meters: number;
  total_kg: number | null;
  line_count: number;
}

function lineMeters(line: SalesOrderFabricLine): number {
  if (line.unit === "meters" || line.unit === "m") return line.quantity;
  return 0;
}

function pushAggregate(map: Map<string, QuantityAggregate>, label: string, meters: number) {
  const existing = map.get(label);
  if (existing) {
    existing.line_count += 1;
    existing.total_meters += meters;
    return;
  }
  map.set(label, { label, line_count: 1, total_meters: meters });
}

function sortedAggregates(map: Map<string, QuantityAggregate>): QuantityAggregate[] {
  return [...map.values()].sort((a, b) => b.total_meters - a.total_meters || a.label.localeCompare(b.label));
}

export function buildSalesOrderArticlesSummary(lines: SalesOrderFabricLine[]): SalesOrderArticlesSummary {
  const articleMap = buildSoArticleMapFromFabricLines(lines);
  const byGarment = new Map<string, QuantityAggregate>();
  const bySupplier = new Map<string, QuantityAggregate>();

  const articleLines: ArticleLineSummary[] = lines
    .map((line) => {
      const articleNumber = articleMap.get(line.id) ?? 0;
      const meters = lineMeters(line);
      const supplierLabel = formatFabricSupplierName(
        line.supplier_id,
        line.supplier_name,
        line.fabric_number
      );

      pushAggregate(byGarment, line.garment_type, meters);
      pushAggregate(bySupplier, supplierLabel, meters);

      const pieces = piecesForFabricLine(line);
      return {
        line_id: line.id,
        article_number: articleNumber,
        article_label: formatFabricLineArticle(articleNumber),
        garment_type: line.garment_type,
        pieces,
        garment_label: formatGarmentWithPieceList(line.garment_type, pieces),
        fabric_number: line.fabric_number,
        supplier_label: supplierLabel,
        meters,
        kg: fabricLineWeightKg(line),
      };
    })
    .sort((a, b) => a.article_number - b.article_number || a.line_id.localeCompare(b.line_id));

  return {
    lines: articleLines,
    by_garment: sortedAggregates(byGarment),
    by_supplier: sortedAggregates(bySupplier),
    total_meters: totalFabricMeters(lines),
    total_kg: totalFabricWeightKg(lines),
    line_count: lines.length,
  };
}

export function formatAggregateMeters(meters: number): string {
  return `${meters.toFixed(1)} m`;
}
