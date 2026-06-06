import { BRAND_CLIENT_CODE_PREFIX } from "@/lib/clients/codes";
import { getFactoryBrandById } from "@/lib/data/factory-brands";
import { brandPrefixFromClientCode } from "@/lib/sales-orders/label-codes";
import type { SalesOrder } from "@/lib/types/sales-orders";

/** Production brand label for factory floor docs (stitching specs differ per brand). */
export function productionBrandNameForOrder(
  order: Pick<SalesOrder, "client_code" | "retail_brand">
): string {
  if (order.retail_brand?.trim()) {
    const byId = getFactoryBrandById(order.retail_brand.trim());
    if (byId) return byId.name;
    return order.retail_brand
      .trim()
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  const prefix = brandPrefixFromClientCode(order.client_code);
  const brandId = Object.entries(BRAND_CLIENT_CODE_PREFIX).find(([, code]) => code === prefix)?.[0];
  return getFactoryBrandById(brandId ?? "")?.name ?? prefix;
}
