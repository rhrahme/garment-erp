"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { TransferEligibility } from "@/lib/sales-orders/transfer-eligibility";
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
  /** Optional stage hint from Fabric Receiving (refreshed from API on open). */
  initialStageLabel?: string | null;
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
  initialStageLabel = null,
  onClose,
  onTransferred,
}: FabricTransferModalProps) {
  const [orders, setOrders] = useState<DestinationOption[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [eligibility, setEligibility] = useState<TransferEligibility | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [clientFilter, setClientFilter] = useState("");
  const [destinationOrderId, setDestinationOrderId] = useState("");
  const [meters, setMeters] = useState(String(sourceLine.quantity));
  const [reason, setReason] = useState("");
  const [ackReceiving, setAckReceiving] = useState(false);
  const [adminOverride, setAdminOverride] = useState(false);
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
    setAckReceiving(false);
    setAdminOverride(false);
    setEligibility(null);

    let cancelled = false;
    setLoadingOrders(true);
    setLoadingEligibility(true);

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

    const params = new URLSearchParams({ source_line_id: sourceLine.id });
    fetch(`/api/sales-orders/${sourceOrder.id}/fabric-lines/transfer?${params}`)
      .then((res) => res.json())
      .then((data: { eligibility?: TransferEligibility; is_admin?: boolean; error?: string }) => {
        if (cancelled) return;
        if (data.eligibility) setEligibility(data.eligibility);
        setIsAdmin(Boolean(data.is_admin));
        if (data.error && !data.eligibility) setError(data.error);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load source fabric stage.");
      })
      .finally(() => {
        if (!cancelled) setLoadingEligibility(false);
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

  const needsReceivingAck = Boolean(eligibility?.requires_receiving_ack);
  const canSubmitOverride =
    Boolean(eligibility?.admin_override_available) && isAdmin && adminOverride && !isPartial;

  const submitBlocked =
    (needsReceivingAck && !ackReceiving) ||
    (Boolean(eligibility?.admin_override_available) &&
      eligibility?.blocked &&
      !(isAdmin && adminOverride)) ||
    (adminOverride && isPartial);

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
    if (needsReceivingAck && !ackReceiving) {
      setError("Confirm the receiving-stage warning before transferring.");
      return;
    }
    if (eligibility?.blocked && eligibility.admin_override_available) {
      if (!isAdmin) {
        setError("Only Admin can override handed-off / cutting-queue fabric.");
        return;
      }
      if (!adminOverride) {
        setError("Confirm Admin override to cancel cutting work orders and continue.");
        return;
      }
      if (isPartial) {
        setError("Admin override requires transferring the full line quantity.");
        return;
      }
    }
    if (eligibility?.blocked && !eligibility.admin_override_available) {
      setError(eligibility.message);
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
          acknowledge_receiving_stage: ackReceiving,
          admin_override: canSubmitOverride,
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

  const stageLabel =
    eligibility?.stage_label ?? initialStageLabel ?? (loadingEligibility ? "Loading…" : "Unknown");

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
            <p className="mt-2 text-xs text-slate-600">
              <span className="font-medium text-slate-800">Source stage:</span> {stageLabel}
              {" · "}
              {sourceOrder.client_name}
            </p>
          </div>

          {eligibility?.requires_receiving_ack ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
              <p className="font-medium">Receiving work in progress</p>
              <p className="mt-1">{eligibility.message}</p>
              <label className="mt-3 flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={ackReceiving}
                  onChange={(e) => setAckReceiving(e.target.checked)}
                />
                <span>
                  I understand this fabric is at <strong>{eligibility.stage_label}</strong> for{" "}
                  {eligibility.client_name}, and I still want to transfer.
                </span>
              </label>
            </div>
          ) : null}

          {eligibility?.blocked && eligibility.admin_override_available ? (
            <div className="rounded-xl border border-orange-300 bg-orange-50 px-3 py-3 text-sm text-orange-950">
              <p className="font-medium">Already handed to workshop / in cutting queue</p>
              <p className="mt-1">{eligibility.message}</p>
              {eligibility.remediation ? (
                <p className="mt-2 text-xs text-orange-900/90">{eligibility.remediation}</p>
              ) : null}
              {isAdmin ? (
                <label className="mt-3 flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={adminOverride}
                    onChange={(e) => {
                      setAdminOverride(e.target.checked);
                      if (e.target.checked) setMeters(String(sourceLine.quantity));
                    }}
                  />
                  <span>
                    Admin override: cancel {eligibility.active_work_order_count || "cutting"} work
                    order(s), transfer the <strong>full</strong> {sourceLine.quantity}m, and note
                    this in the reason. Destination must hand off to cutting again with new stickers.
                  </span>
                </label>
              ) : (
                <p className="mt-3 text-xs font-medium">
                  Ask an Admin to override, or finish / reset production for this line first.
                </p>
              )}
            </div>
          ) : null}

          {eligibility?.blocked && !eligibility.admin_override_available ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
              <p className="font-medium">Transfer blocked — already in production</p>
              <p className="mt-1">{eligibility.message}</p>
              {eligibility.remediation ? (
                <p className="mt-2 text-xs">{eligibility.remediation}</p>
              ) : null}
            </div>
          ) : null}

          <label className="block text-sm">
            <span className="font-medium text-slate-800">Filter destination client / SO</span>
            <input
              type="search"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              placeholder="Search client name, code, or SO…"
              disabled={Boolean(eligibility?.blocked && !eligibility.admin_override_available)}
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-800">Destination sales order</span>
            <select
              value={destinationOrderId}
              onChange={(e) => setDestinationOrderId(e.target.value)}
              required
              disabled={
                loadingOrders ||
                Boolean(eligibility?.blocked && !eligibility.admin_override_available)
              }
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
              disabled={adminOverride}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            />
            {isPartial && !adminOverride ? (
              <p className="mt-1 text-xs text-amber-800">
                Partial transfer: {metersNum}m moves; {sourceLine.quantity - metersNum}m stays on{" "}
                {sourceOrder.so_number}. Replacement reorder is for {metersNum}m.
              </p>
            ) : null}
            {adminOverride ? (
              <p className="mt-1 text-xs text-orange-800">
                Override transfers the full line ({sourceLine.quantity}m). Partial meters are not
                allowed while cancelling cutting work orders.
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
              placeholder={
                adminOverride
                  ? "e.g. Emergency for Client B — Admin override, cancel cutting WOs before cut started"
                  : "e.g. Client B urgent — Client A fabric temporarily reassigned"
              }
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
            <Button
              type="submit"
              disabled={
                submitting ||
                loadingOrders ||
                loadingEligibility ||
                submitBlocked ||
                Boolean(eligibility?.blocked && !eligibility.admin_override_available)
              }
            >
              {submitting
                ? "Transferring…"
                : adminOverride
                  ? "Override & transfer"
                  : "Transfer fabric"}
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
