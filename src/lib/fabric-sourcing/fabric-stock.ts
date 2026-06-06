import type { SupplierFabric } from "@/lib/types/fabric-sourcing";

export type FabricStockStatus = NonNullable<SupplierFabric["stock_status"]>;

export function isFabricUnavailable(
  stockStatus: SupplierFabric["stock_status"] | null | undefined
): boolean {
  return stockStatus === "temp_unavailable" || stockStatus === "permanently_unavailable";
}

export function formatFabricStockLabel(fabric: Pick<SupplierFabric, "stock_status" | "restock_date">): string | null {
  if (!fabric.stock_status || fabric.stock_status === "in_stock") return null;
  if (fabric.stock_status === "temp_unavailable") {
    return fabric.restock_date ? `Out until ${fabric.restock_date}` : "Temporarily unavailable";
  }
  if (fabric.stock_status === "permanently_unavailable") return "Sold out";
  return null;
}

export function fabricStockTone(
  stockStatus: SupplierFabric["stock_status"]
): "ok" | "warn" | "danger" | null {
  if (!stockStatus || stockStatus === "in_stock") return null;
  if (stockStatus === "temp_unavailable") return "warn";
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
  return Boolean(
    line.needs_replacement || (line.stock_status && line.stock_status !== "in_stock")
  );
}

export function formatSalesOrderLineStock(line: SalesOrderStockLine): string | null {
  if (line.needs_replacement) {
    return line.replacement_fabric_number
      ? `Replace with ${line.replacement_fabric_number}`
      : "Sold out — replacement needed";
  }
  return formatFabricStockLabel(line);
}
