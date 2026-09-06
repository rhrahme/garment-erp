"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { READY_MADE_BRANDS } from "@/lib/integrations/clickup/ready-made-brands";
import type { SalesOrder } from "@/lib/types/sales-orders";

export function MarkReadyMadeControl({
  order,
  onUpdated,
}: {
  order: SalesOrder;
  onUpdated: (order: SalesOrder) => void;
}) {
  const router = useRouter();
  const [brand, setBrand] = useState("boggi");
  const [article, setArticle] = useState(order.product_article ?? order.fabric_lines[0]?.garment_type ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${order.id}/mark-ready-made`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, article: article.trim() || null }),
      });
      const data = (await res.json()) as { error?: string; order?: SalesOrder };
      if (!res.ok || !data.order) throw new Error(data.error ?? "Failed to mark ready-made.");
      onUpdated(data.order);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark ready-made.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <p className="text-sm font-semibold text-amber-950">This is Ready-Made, not a person client</p>
      <p className="mt-1 text-sm text-amber-900">
        Size runs (Stock-44, Stock-46, ...) for Boggi / Massimo / Suit Supply go
        under Ready-Made. Stickers stay the same.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm font-medium text-slate-700">
          Brand
          <select
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
          >
            {READY_MADE_BRANDS.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Article
          <input
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
            value={article}
            onChange={(event) => setArticle(event.target.value)}
            placeholder="Overcoat"
          />
        </label>
        <Button type="button" disabled={busy} onClick={() => void submit()}>
          {busy ? "Moving..." : "Mark as ready-made"}
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
