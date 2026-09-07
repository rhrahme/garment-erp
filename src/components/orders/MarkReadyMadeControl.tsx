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
  const [open, setOpen] = useState(false);
  const [brand, setBrand] = useState("");
  const [article, setArticle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!brand) {
      setError("Pick the Ready-Made brand. This is not the client on the order.");
      return;
    }
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
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-sm font-medium text-slate-800">
        {order.client_name} is a person client. Brand on this order is not Ready-Made.
      </p>
      <p className="mt-1 text-sm text-slate-600">
        Use Ready-Made only for Stock-44 / Stock-46 size runs (Boggi, Massimo, Suit Supply).
        Do not move a named client here.
      </p>
      {open ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium text-slate-700">
              Ready-Made brand
              <select
                className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
                value={brand}
                onChange={(event) => setBrand(event.target.value)}
              >
                <option value="">Select brand</option>
                {READY_MADE_BRANDS.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Size-run article
              <input
                className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
                value={article}
                onChange={(event) => setArticle(event.target.value)}
                placeholder="Overcoat"
              />
            </label>
            <Button type="button" disabled={busy || !brand} onClick={() => void submit()}>
              {busy ? "Moving..." : "Move to Ready-Made"}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      ) : (
        <button
          type="button"
          className="mt-2 text-sm font-medium text-slate-600 underline hover:text-slate-900"
          onClick={() => setOpen(true)}
        >
          This is a size run - open Ready-Made
        </button>
      )}
    </div>
  );
}
