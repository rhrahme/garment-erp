import type { SupplierFabric } from "@/lib/types/fabric-sourcing";
import { formatRestockDate, isRestockDatePast } from "@/lib/utils";

export type FabricStockStatus = NonNullable<SupplierFabric["stock_status"]>;

type StockFields = Pick<SupplierFabric, "stock_status" | "restock_date">;

/** Stock status for alerts/UI — past restock dates no longer block availability. */
export function effectiveFabricStockStatus(
  fabric: StockFields
): SupplierFabric["stock_status"] | null | undefined {
  if (
    fabric.stock_status === "temp_unavailable" &&
    fabric.restock_date != null &&
    isRestockDatePast(fabric.restock_date)
  ) {
    return "in_stock";
  }
  return fabric.stock_status;
}

export function isFabricUnavailable(
  stockStatus: SupplierFabric["stock_status"] | null | undefined,
  restockDate?: SupplierFabric["restock_date"]
): boolean {
  if (stockStatus === "permanently_unavailable") return true;
  if (stockStatus === "temp_unavailable") {
    return restockDate == null || !isRestockDatePast(restockDate);
  }
  return false;
}

export function formatFabricStockLabel(fabric: StockFields): string | null {
  const stockStatus = effectiveFabricStockStatus(fabric);
  if (!stockStatus || stockStatus === "in_stock") return null;
  if (stockStatus === "temp_unavailable") {
    const restockLabel = formatRestockDate(fabric.restock_date);
    return restockLabel ? `Out until ${restockLabel}` : "Temporarily unavailable";
  }
  if (stockStatus === "permanently_unavailable") return "Sold out";
  return null;
}

export function fabricStockTone(
  stockStatus: SupplierFabric["stock_status"],
  restockDate?: SupplierFabric["restock_date"]
): "ok" | "warn" | "danger" | null {
  const effective = effectiveFabricStockStatus({ stock_status: stockStatus, restock_date: restockDate });
  if (!effective || effective === "in_stock") return null;
  if (effective === "temp_unavailable") return "warn";
  return "danger";
}

type SalesOrderStockLine = Pick<
  SupplierFabric,
  "stock_status" | "restock_date"
> & {
  needs_replacement?: boolean;
  replacement_fabric_number?: string | null;
};

export function orderLineHasStockAlert(line: SalesOrderStockLine): boolean {
  const stockStatus = effectiveFabricStockStatus(line);
  return Boolean(line.needs_replacement || (stockStatus && stockStatus !== "in_stock"));
}

export function formatSalesOrderLineStock(line: SalesOrderStockLine): string | null {
  if (line.needs_replacement) {
    return line.replacement_fabric_number
      ? `Replace with ${line.replacement_fabric_number}`
      : "Sold out — replacement needed";
  }
  return formatFabricStockLabel(line);
}
