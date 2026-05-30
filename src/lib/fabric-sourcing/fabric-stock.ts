import type { SupplierFabric } from "@/lib/types/fabric-sourcing";

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
