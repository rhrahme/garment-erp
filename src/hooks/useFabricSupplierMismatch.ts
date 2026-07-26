"use client";

import { useEffect, useState } from "react";
import type { FabricSupplierMismatchHint } from "@/lib/fabric-sourcing/fabric-catalog-owner";

export function useFabricSupplierMismatch(supplierId: string, fabricNumber: string) {
  const [hint, setHint] = useState<FabricSupplierMismatchHint | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = fabricNumber.trim();
    if (!supplierId || !trimmed || trimmed.length < 3) {
      setHint(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          supplier_id: supplierId,
          fabric_number: trimmed,
        });
        const res = await fetch(`/api/fabric-supplier-hint?${params}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { hint: FabricSupplierMismatchHint | null };
        if (!cancelled) setHint(data.hint);
      } catch {
        if (!cancelled) setHint(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [supplierId, fabricNumber]);

  return { hint, loading };
}
