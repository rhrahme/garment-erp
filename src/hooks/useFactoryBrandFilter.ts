"use client";

import { useCallback, useEffect, useState } from "react";
import { getFactoryBrandById } from "@/lib/data/factory-brands";

export const FACTORY_BRAND_FILTER_KEY = "erp-factory-brand-filter";

export function useFactoryBrandFilter(defaultBrandId: string | null = null) {
  const [brandId, setBrandIdState] = useState<string | null>(defaultBrandId);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(FACTORY_BRAND_FILTER_KEY);
    if (stored && getFactoryBrandById(stored)) {
      setBrandIdState(stored);
    }
    setHydrated(true);
  }, []);

  const setBrandId = useCallback((next: string | null) => {
    setBrandIdState(next);
    if (next && getFactoryBrandById(next)) {
      localStorage.setItem(FACTORY_BRAND_FILTER_KEY, next);
    } else {
      localStorage.removeItem(FACTORY_BRAND_FILTER_KEY);
    }
  }, []);

  return { brandId, setBrandId, hydrated };
}
