"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";

export function OrderFabricLineRemove({
  orderId,
  line,
  productionMode = false,
  onLineRemoved,
}: {
  orderId: string;
  line: SalesOrderFabricLine;
  productionMode?: boolean;
  onLineRemoved?: (lineId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${orderId}/fabric-lines`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_id: line.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to remove fabric line.");

      onLineRemoved?.(line.id);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove fabric line.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 gap-1 px-2 text-xs text-red-700 hover:text-red-800"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {productionMode ? "Remove article" : "Remove line"}
      </Button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-red-200 bg-red-50/60 p-3 text-sm">
      <p className="text-slate-800">
        Remove {line.fabric_number} ({line.garment_type}) from this order?
      </p>
      {error && <p className="mt-2 text-red-800">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="bg-red-700 hover:bg-red-800"
          onClick={() => void handleRemove()}
          disabled={submitting}
        >
          {submitting ? "Removing…" : "Yes, remove"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
