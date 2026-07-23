"use client";

import { useEffect, useMemo, useState } from "react";
import { getFactoryBrands, type FactoryBrand } from "@/lib/data/factory-brands";

const allFactoryBrands = getFactoryBrands();

/**
 * Loads `allowed_sales_brand_ids` from the session API for sales brand scoping.
 * `null` = unrestricted (admin / unscoped sales).
 */
export function useSalesBrandScope(): {
  allowedBrandIds: string[] | null;
  brands: FactoryBrand[];
  hydrated: boolean;
  isScoped: boolean;
} {
  const [allowedBrandIds, setAllowedBrandIds] = useState<string[] | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) return;
        const data = (await res.json()) as { allowed_sales_brand_ids?: string[] | null };
        if (!cancelled) {
          setAllowedBrandIds(
            Array.isArray(data.allowed_sales_brand_ids) ? data.allowed_sales_brand_ids : null
          );
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const brands = useMemo(() => {
    if (!allowedBrandIds) return allFactoryBrands;
    const allowed = new Set(allowedBrandIds);
    return allFactoryBrands.filter((brand) => allowed.has(brand.id));
  }, [allowedBrandIds]);

  return {
    allowedBrandIds,
    brands,
    hydrated,
    isScoped: Boolean(allowedBrandIds && allowedBrandIds.length > 0),
  };
}
