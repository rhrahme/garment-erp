"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { SalesOrder } from "@/lib/types/sales-orders";
import { formatDateTimeRiyadh } from "@/lib/utils";

export function FabricOrderSubmitButton({
  order,
  label,
  hint,
  submittedBadge,
}: {
  order: SalesOrder;
  label: string;
  hint: string;
  submittedBadge: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadySubmitted = Boolean(order.fabric_order_requested_at);
  const canSubmit =
    !alreadySubmitted &&
    order.status === "open" &&
    order.fabric_po_ids.length === 0 &&
    order.fabric_lines.length > 0;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${order.id}/fabric-order-request`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to submit fabric order.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit fabric order.");
    } finally {
      setSubmitting(false);
    }
  }

  if (alreadySubmitted && order.fabric_po_ids.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-medium">{submittedBadge}</p>
        {(order.fabric_order_requested_by || order.fabric_order_requested_at) && (
          <p className="mt-1 text-xs text-amber-800">
            {order.fabric_order_requested_by && <>Submitted by {order.fabric_order_requested_by}</>}
            {order.fabric_order_requested_by && order.fabric_order_requested_at && " · "}
            {order.fabric_order_requested_at && formatDateTimeRiyadh(order.fabric_order_requested_at)}
          </p>
        )}
      </div>
    );
  }

  if (!canSubmit) return null;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
      <p className="font-medium text-slate-900">Ready to order fabric?</p>
      <p className="mt-1 text-sm text-slate-600">{hint}</p>
      {error && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}
      <Button className="mt-3" onClick={() => void handleSubmit()} disabled={submitting}>
        {submitting ? "Submitting…" : label}
      </Button>
    </div>
  );
}
