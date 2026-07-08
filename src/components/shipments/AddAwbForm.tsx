"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export type PendingAwbOption = {
  id: string;
  po_number: string;
  supplier_name: string | null;
  destination_city: string | null;
  client_reference: string | null;
  expected_carrier: string | null;
  emailed_at?: string;
};

type AddAwbFormProps = {
  pendingOrders: PendingAwbOption[];
  defaultPoId?: string | null;
  compact?: boolean;
  onAdded?: () => void;
};

export function AddAwbForm({ pendingOrders, defaultPoId, compact, onAdded }: AddAwbFormProps) {
  const [purchaseOrderId, setPurchaseOrderId] = useState(defaultPoId ?? pendingOrders[0]?.id ?? "");
  const [awbNumber, setAwbNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedPo = pendingOrders.find((po) => po.id === purchaseOrderId);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/shipments/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awb_number: awbNumber,
          carrier: carrier || selectedPo?.expected_carrier || undefined,
          purchase_order_id: purchaseOrderId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add AWB");

      setMessage(data.message ?? "AWB added.");
      setAwbNumber("");
      onAdded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add AWB");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className={compact ? "flex flex-wrap items-end gap-2" : "space-y-4 rounded-xl border border-slate-200 bg-white p-5"}
    >
      {!compact && <p className="text-sm font-medium text-slate-900">Add AWB manually</p>}

      {pendingOrders.length > 0 && (
        <div className={compact ? "min-w-[12rem] flex-1" : ""}>
          {!compact && <label className="mb-1 block text-xs font-medium text-slate-600">Fabric PO</label>}
          <select
            value={purchaseOrderId}
            onChange={(event) => setPurchaseOrderId(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {pendingOrders.map((po) => (
              <option key={po.id} value={po.id}>
                {po.po_number}
                {po.supplier_name ? ` · ${po.supplier_name}` : ""}
                {po.client_reference ? ` · ${po.client_reference}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={compact ? "min-w-[10rem] flex-1" : ""}>
        {!compact && <label className="mb-1 block text-xs font-medium text-slate-600">AWB number</label>}
        <input
          type="text"
          value={awbNumber}
          onChange={(event) => setAwbNumber(event.target.value)}
          placeholder="e.g. 1234567890"
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
        />
      </div>

      <div className={compact ? "w-28" : ""}>
        {!compact && <label className="mb-1 block text-xs font-medium text-slate-600">Carrier</label>}
        <input
          type="text"
          value={carrier}
          onChange={(event) => setCarrier(event.target.value)}
          placeholder={selectedPo?.expected_carrier ?? "DHL"}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <Button type="submit" disabled={busy || !awbNumber.trim()} size={compact ? "sm" : "md"}>
        {busy ? "Saving…" : "Add AWB"}
      </Button>

      {error && (
        <p className={`text-sm text-red-700 ${compact ? "w-full" : ""}`}>{error}</p>
      )}
      {message && (
        <p className={`text-sm text-emerald-700 ${compact ? "w-full" : ""}`}>{message}</p>
      )}
    </form>
  );
}
