"use client";

import { useCallback, useEffect, useState } from "react";
import type { FabricReceipt } from "@/lib/types/fabric-receipts";

export function useFabricReceipts() {
  const [receipts, setReceipts] = useState<FabricReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fabric-receiving/receipts", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load fabric receipts");
      const data = (await res.json()) as { receipts: FabricReceipt[] };
      setReceipts(data.receipts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fabric receipts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { receipts, loading, error, load, setError };
}
