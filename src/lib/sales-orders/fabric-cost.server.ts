import "server-only";

import { loroPianaFabrics, searchSupplierFabrics, solbiatiFabrics } from "@/lib/data/supplier-catalog-data";
import {
  getLoroPianaMillLine,
  isLoroPianaStyleSupplier,
  normalizeLoroPianaFabricNumber,
} from "@/lib/fabric-sourcing/loro-piana-styles";
import { resolveFabricSupplierId } from "@/lib/fabric-sourcing/supplier-aliases";
import {
  getFabricCostSummary,
  type FabricCostResolution,
} from "@/lib/sales-orders/fabric-cost";
import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";

function catalogUnitPrice(supplierId: string, fabricNumber: string): number | null {
  const trimmed = fabricNumber.trim();
  if (!trimmed) return null;

  function findPrice(id: string, number: string): number | null {
    const canonicalId = resolveFabricSupplierId(id);
    const lookupNumber = isLoroPianaStyleSupplier(canonicalId)
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

  if (canonicalId === "loro-piana" && getLoroPianaMillLine(trimmed) === "solbiati") {
    return findPrice("solbiati", trimmed);
  }
  return null;
}

/** True when bundled supplier catalog JSON is present (Solbiati + Loro Piana). */
export function isSupplierCatalogReady(): boolean {
  return solbiatiFabrics.length > 0 && loroPianaFabrics.length > 0;
}

export function resolveFabricUnitPricesForOrderLines(
  lines: SalesOrderFabricLine[]
): SalesOrderFabricLine[] {
  return lines.map((line) => {
    if (line.unit_price != null && line.unit_price > 0) return line;
    return {
      ...line,
      unit_price: catalogUnitPrice(line.supplier_id, line.fabric_number) ?? line.unit_price,
    };
  });
}

/** Server-only fabric cost lookup; catalog prices never enter a client dependency graph. */
export function resolveFabricCostForOrderLines(lines: SalesOrderFabricLine[]): FabricCostResolution {
  try {
    const catalogReady = isSupplierCatalogReady();
    const pricedLines = resolveFabricUnitPricesForOrderLines(lines);
    const summary = getFabricCostSummary(pricedLines);
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
