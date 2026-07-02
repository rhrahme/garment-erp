import { getSupplierPriceCurrency, toSar, type PriceCurrency } from "@/lib/currency/config";
import { formatSupplierUnitPrice } from "@/lib/currency/format";
import { loroPianaFabrics, searchSupplierFabrics, solbiatiFabrics } from "@/lib/data/supplier-catalog-data";
import {
  getLoroPianaMillLine,
  isLoroPianaStyleSupplier,
  normalizeLoroPianaFabricNumber,
} from "@/lib/fabric-sourcing/loro-piana-styles";
import { resolveFabricSupplierId } from "@/lib/fabric-sourcing/supplier-aliases";
import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";
import { formatCurrency } from "@/lib/utils";

/** Client-safe catalog price lookup — avoids supplier-contacts/fs via resolve-fabric-from-catalog. */
function catalogUnitPrice(supplierId: string, fabricNumber: string): number | null {
  const trimmed = fabricNumber.trim();
  if (!trimmed) return null;

  function findPrice(id: string, number: string): number | null {
    const canonicalId = resolveFabricSupplierId(id);
    const usesLpStyle = isLoroPianaStyleSupplier(canonicalId);
    const lookupNumber = usesLpStyle
      ? normalizeLoroPianaFabricNumber(number).toLowerCase()
      : number.toLowerCase();
    const matches = searchSupplierFabrics(canonicalId, number, 20);
    const match =
      matches.find((item) => item.fabric_number.toLowerCase() === lookupNumber) ??
      matches.find((item) => item.fabric_number.toLowerCase() === number.toLowerCase());
    const price = match?.unit_price;
    return price != null && price > 0 ? price : null;
  }

  const canonicalId = resolveFabricSupplierId(supplierId);
  const direct = findPrice(canonicalId, trimmed);
  if (direct != null) return direct;

  // Loro Piana account orders include Solbiati linens (S-prefix) from the same price list.
  if (canonicalId === "loro-piana" && getLoroPianaMillLine(trimmed) === "solbiati") {
    return findPrice("solbiati", trimmed);
  }

  return null;
}

export interface FabricCostSummary {
  line_count: number;
  priced_line_count: number;
  missing_price_line_count: number;
  /** Sum of supplier line totals converted to SAR. */
  total_sar: number;
  /** Raw supplier totals before FX conversion. */
  totals_by_currency: Partial<Record<PriceCurrency, number>>;
}

function effectiveFabricUnitPrice(line: SalesOrderFabricLine): number | null {
  if (line.unit_price != null && line.unit_price > 0) return line.unit_price;
  return catalogUnitPrice(line.supplier_id, line.fabric_number);
}

/** Unit price from the line or supplier catalog — for display on order detail tables. */
export function fabricLineEffectiveUnitPrice(line: SalesOrderFabricLine): number | null {
  return effectiveFabricUnitPrice(line);
}

export function formatFabricLineSupplierPrice(line: SalesOrderFabricLine): string {
  const unitPrice = effectiveFabricUnitPrice(line);
  if (unitPrice == null) return "—";
  return formatSupplierUnitPrice(unitPrice, line.supplier_id, line.unit);
}

export function fabricLineSupplierTotal(line: SalesOrderFabricLine): number | null {
  const unitPrice = effectiveFabricUnitPrice(line);
  if (unitPrice == null || line.quantity <= 0) return null;
  return Math.round(unitPrice * line.quantity * 100) / 100;
}

export function getFabricCostSummary(lines: SalesOrderFabricLine[]): FabricCostSummary {
  const totalsByCurrency: Partial<Record<PriceCurrency, number>> = {};
  let pricedLineCount = 0;
  let totalSar = 0;

  for (const line of lines) {
    const lineTotal = fabricLineSupplierTotal(line);
    if (lineTotal == null) continue;

    pricedLineCount += 1;
    const currency = getSupplierPriceCurrency(line.supplier_id);
    totalsByCurrency[currency] = Math.round(((totalsByCurrency[currency] ?? 0) + lineTotal) * 100) / 100;
    totalSar += toSar(lineTotal, currency);
  }

  return {
    line_count: lines.length,
    priced_line_count: pricedLineCount,
    missing_price_line_count: lines.length - pricedLineCount,
    total_sar: Math.round(totalSar * 100) / 100,
    totals_by_currency: totalsByCurrency,
  };
}

export function formatFabricCostSummary(summary: FabricCostSummary): string {
  if (summary.priced_line_count === 0) return formatCurrency(0, "SAR");

  const sar = formatCurrency(summary.total_sar, "SAR");
  const currencyTotals = Object.entries(summary.totals_by_currency) as [PriceCurrency, number][];

  if (currencyTotals.length === 1) {
    const [currency, amount] = currencyTotals[0];
    return `${formatCurrency(amount, currency)} · ${sar}`;
  }

  return sar;
}

export function formatFabricCostHint(summary: FabricCostSummary): string | null {
  if (summary.priced_line_count === 0) {
    return summary.line_count === 0
      ? null
      : "No supplier prices found — fill Price on lines or check supplier catalogs";
  }
  if (summary.missing_price_line_count === 0) return null;
  const missingWord = summary.missing_price_line_count === 1 ? "line" : "lines";
  return `${summary.missing_price_line_count} ${missingWord} without price (from line or catalog)`;
}

/** True when bundled supplier catalog JSON is present (Solbiati + Loro Piana). */
export function isSupplierCatalogReady(): boolean {
  return solbiatiFabrics.length > 0 && loroPianaFabrics.length > 0;
}

export interface FabricCostResolution {
  summary: FabricCostSummary;
  catalogReady: boolean;
  error: string | null;
}

/** Server-side fabric cost — always uses raw lines and bundled supplier catalogs. */
export function resolveFabricCostForOrderLines(lines: SalesOrderFabricLine[]): FabricCostResolution {
  try {
    const catalogReady = isSupplierCatalogReady();
    const summary = getFabricCostSummary(lines);
    const error =
      lines.length > 0 && summary.priced_line_count === 0 && !catalogReady
        ? "Supplier catalog not loaded on server — contact support"
        : null;
    return { summary, catalogReady, error };
  } catch (err) {
    return {
      summary: {
        line_count: lines.length,
        priced_line_count: 0,
        missing_price_line_count: lines.length,
        total_sar: 0,
        totals_by_currency: {},
      },
      catalogReady: false,
      error: err instanceof Error ? err.message : "Fabric cost calculation failed",
    };
  }
}
