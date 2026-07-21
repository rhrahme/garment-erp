"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

type DestinationOption = {
  id: string;
  so_number: string;
  client_id: string;
  client_code: string;
  client_name: string;
  status: string;
};

type FabricTransferModalProps = {
  open: boolean;
  sourceOrder: Pick<SalesOrder, "id" | "so_number" | "client_name" | "client_code">;
  sourceLine: SalesOrderFabricLine;
  onClose: () => void;
  onTransferred: (result: {
    print_stickers_href: string;
    destination_order_id: string;
    destination_so_number: string;
    admin_alert_message: string;
  }) => void;
};

export function FabricTransferModal({
  open,
  sourceOrder,
  sourceLine,
  onClose,
  onTransferred,
}: FabricTransferModalProps) {
  const [orders, setOrders] = useState<DestinationOption[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [clientFilter, setClientFilter] = useState("");
  const [destinationOrderId, setDestinationOrderId] = useState("");
  const [meters, setMeters] = useState(String(sourceLine.quantity));
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMeters(String(sourceLine.quantity));
    setReason("");
    setDestinationOrderId("");
    setClientFilter("");
    setError(null);
    setSubmitting(false);

    let cancelled = false;
    setLoadingOrders(true);
    fetch("/api/sales-orders")
      .then((res) => res.json())
      .then((data: { orders?: SalesOrder[] }) => {
        if (cancelled) return;
        const options = (data.orders ?? [])
          .filter(
            (order) =>
              order.id !== sourceOrder.id &&
              order.status !== "complete" &&
              !order.retail_brand?.trim()
          )
          .map((order) => ({
            id: order.id,
            so_number: order.so_number,
            client_id: order.client_id,
            client_code: order.client_code,
            client_name: order.client_name,
            status: order.status,
          }))
          .sort((a, b) => a.client_name.localeCompare(b.client_name) || a.so_number.localeCompare(b.so_number));
        setOrders(options);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load destination orders.");
      })
      .finally(() => {
        if (!cancelled) setLoadingOrders(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, sourceOrder.id, sourceLine.id, sourceLine.quantity]);

  const filteredOrders = useMemo(() => {
    const q = clientFilter.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (order) =>
        order.client_name.toLowerCase().includes(q) ||
        order.client_code.toLowerCase().includes(q) ||
        order.so_number.toLowerCase().includes(q)
    );
  }, [orders, clientFilter]);

  const selected = orders.find((order) => order.id === destinationOrderId) ?? null;
  const metersNum = Number(meters);
  const isPartial = Number.isFinite(metersNum) && metersNum > 0 && metersNum < sourceLine.quantity;

  if (!open) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!destinationOrderId) {
      setError("Choose a destination sales order (client + SO).");
      return;
    }
    if (!reason.trim()) {
      setError("Enter a reason for the audit trail.");
      return;
    }
    if (!Number.isFinite(metersNum) || metersNum <= 0) {
      setError("Enter valid meters to transfer.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/sales-orders/${sourceOrder.id}/fabric-lines/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_line_id: sourceLine.id,
          destination_sales_order_id: destinationOrderId,
          meters: metersNum,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Transfer failed.");
      }

      onTransferred({
        print_stickers_href: data.print_stickers_href as string,
        destination_order_id: data.destination_order?.id as string,
        destination_so_number: data.destination_order?.so_number as string,
        admin_alert_message:
          (data.admin_alert?.message as string) ??
          "Replacement fabric needs supplier email on the source order.",
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fabric-transfer-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="fabric-transfer-title" className="text-lg font-semibold text-slate-900">
              Transfer fabric
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Move fabric from {sourceOrder.client_name} ({sourceOrder.so_number}) to another
              client&apos;s order. Creates a permanent audit record, new destination stickers, and a
              replacement reorder for {sourceOrder.client_name}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-5 py-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p>
              <span className="font-medium">{sourceLine.fabric_number}</span>
              {" · "}
              {sourceLine.garment_type}
              {" · "}
              {sourceLine.quantity}m available
            </p>
            <p className="mt-1 font-mono text-xs text-indigo-700">
              {(sourceLine.label_stickers ?? [])[0]?.code ?? "—"}
            </p>
          </div>

          <label className="block text-sm">
            <span className="font-medium text-slate-800">Filter destination client / SO</span>
            <input
              type="search"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              placeholder="Search client name, code, or SO…"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-800">Destination sales order</span>
            <select
              value={destinationOrderId}
              onChange={(e) => setDestinationOrderId(e.target.value)}
              required
              disabled={loadingOrders}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value="">{loadingOrders ? "Loading…" : "Select client + SO…"}</option>
              {filteredOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.client_name} ({order.client_code}) — {order.so_number}
                </option>
              ))}
            </select>
            {selected ? (
              <p className="mt-1 text-xs text-slate-500">
                Transferring to {selected.client_name} · {selected.so_number}
                {selected.client_code === sourceOrder.client_code
                  ? " (same client code — confirm this is intentional)"
                  : ""}
              </p>
            ) : null}
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-800">Meters to transfer</span>
            <input
              type="number"
              min={0.01}
              max={sourceLine.quantity}
              step="0.01"
              value={meters}
              onChange={(e) => setMeters(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            />
            {isPartial ? (
              <p className="mt-1 text-xs text-amber-800">
                Partial transfer: {metersNum}m moves; {sourceLine.quantity - metersNum}m stays on{" "}
                {sourceOrder.so_number}. Replacement reorder is for {metersNum}m.
              </p>
            ) : null}
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-800">Reason (required)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              placeholder="e.g. Client B urgent — Client A fabric temporarily reassigned"
            />
          </label>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || loadingOrders}>
              {submitting ? "Transferring…" : "Transfer fabric"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function FabricTransferSuccessBanner({
  printHref,
  destinationSoNumber,
  destinationOrderId,
  adminAlertMessage,
  onDismiss,
}: {
  printHref: string;
  destinationSoNumber: string;
  destinationOrderId: string;
  adminAlertMessage: string;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Fabric transferred to {destinationSoNumber}</p>
          <p className="mt-1">{adminAlertMessage}</p>
          <p className="mt-2 text-emerald-900">
            Print a new sticker for the destination client before floor scans.
          </p>
        </div>
        <button type="button" onClick={onDismiss} className="text-emerald-800 hover:underline">
          Dismiss
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={printHref} target="_blank" rel="noreferrer">
          <Button size="sm">Print destination sticker</Button>
        </Link>
        <Link href={`/orders/${destinationOrderId}`}>
          <Button size="sm" variant="secondary">
            Open {destinationSoNumber}
          </Button>
        </Link>
        <Link href="/supplier-emails">
          <Button size="sm" variant="secondary">
            Supplier emails
          </Button>
        </Link>
      </div>
    </div>
  );
}
