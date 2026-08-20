"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { PatternSalesOrderMismatch } from "@/lib/sales-orders/pattern-so-mismatch";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

type DeleteRequestAction = "request_delete" | "cancel_request" | "keep" | "confirm_delete";

export function OrderFabricLineDeleteRequest({
  orderId,
  line,
  sessionEmail,
  isAdmin = false,
  productionMode = false,
  patternMismatch = null,
  patternJobsForLine = 0,
  onOrderUpdated,
  onLineRemoved,
}: {
  orderId: string;
  line: SalesOrderFabricLine;
  sessionEmail?: string | null;
  isAdmin?: boolean;
  productionMode?: boolean;
  patternMismatch?: PatternSalesOrderMismatch | null;
  patternJobsForLine?: number;
  onOrderUpdated?: (order: SalesOrder) => void;
  onLineRemoved?: (lineId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followUpNote, setFollowUpNote] = useState<string | null>(null);

  const pending = Boolean(line.delete_requested_at);
  const isRequester =
    Boolean(sessionEmail) &&
    line.delete_requested_by?.trim().toLowerCase() === sessionEmail?.trim().toLowerCase();

  async function postAction(action: DeleteRequestAction, forceCancelOrphanJobs = false) {
    setSubmitting(true);
    setError(null);
    setFollowUpNote(null);
    try {
      const res = await fetch(`/api/sales-orders/${orderId}/fabric-lines/delete-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          line_id: line.id,
          reason: reason.trim() || null,
          force_cancel_orphan_jobs: forceCancelOrphanJobs,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        order?: SalesOrder;
        pending_cancellations?: number;
        supplier_follow_up_needed?: boolean;
        po_number?: string | null;
      };
      if (!res.ok) {
        if (res.status === 409 && data.pending_cancellations && !forceCancelOrphanJobs) {
          const proceed = window.confirm(
            `${data.error ?? "Pattern jobs would be cancelled."}\n\nContinue and cancel those pattern jobs?`
          );
          if (proceed) {
            setSubmitting(false);
            await postAction(action, true);
            return;
          }
        }
        throw new Error(data.error ?? "Failed to process delete request.");
      }

      if (action === "confirm_delete") {
        onLineRemoved?.(line.id);
        if (data.supplier_follow_up_needed) {
          setFollowUpNote(
            `Removed from ERP. ${data.po_number ?? "Supplier PO"} was already emailed - contact the supplier if they should not ship this fabric.`
          );
        }
      } else if (data.order) {
        onOrderUpdated?.(data.order);
      }
      setConfirming(false);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process delete request.");
    } finally {
      setSubmitting(false);
    }
  }

  if (followUpNote) {
    return (
      <p className="mt-2 max-w-[16rem] text-right text-xs text-amber-800">{followUpNote}</p>
    );
  }

  if (pending && isAdmin) {
    return (
      <div className="mt-2 max-w-[16rem] rounded-lg border border-amber-200 bg-amber-50/70 p-2 text-right">
        <p className="text-xs font-medium text-amber-950">Delete requested</p>
        <p className="mt-0.5 text-[11px] text-amber-800">
          by {line.delete_requested_by ?? "unknown"}
          {line.delete_requested_at
            ? ` - ${new Date(line.delete_requested_at).toLocaleString()}`
            : ""}
        </p>
        {line.delete_request_reason ? (
          <p className="mt-1 text-[11px] text-slate-700">{line.delete_request_reason}</p>
        ) : null}
        {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
        <div className="mt-2 flex flex-wrap justify-end gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-7 bg-red-700 px-2 text-xs hover:bg-red-800"
            disabled={submitting}
            onClick={() => void postAction("confirm_delete", patternJobsForLine > 0)}
          >
            OK
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-xs"
            disabled={submitting}
            onClick={() => void postAction("keep")}
          >
            Not
          </Button>
        </div>
      </div>
    );
  }

  if (pending) {
    return (
      <div className="mt-2 max-w-[14rem] text-right">
        <p className="text-xs font-medium text-amber-800">Delete requested - waiting on admin</p>
        {isRequester ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-1 h-7 px-2 text-xs"
            disabled={submitting}
            onClick={() => void postAction("cancel_request")}
          >
            Cancel request
          </Button>
        ) : null}
        {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
      </div>
    );
  }

  if (isAdmin) {
    return null;
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 gap-1 px-2 text-xs text-amber-800 hover:text-amber-900"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Request delete
      </Button>
    );
  }

  return (
    <div className="mt-2 max-w-[16rem] rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-left text-sm">
      <p className="text-slate-800">
        Ask admin to remove {line.fabric_number} ({line.garment_type})? This fabric is on a
        supplier order{productionMode ? "" : " / PO"}.
      </p>
      <label className="mt-2 block text-xs text-slate-600">
        Reason (optional)
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-900"
          placeholder="Wrong article / supplier..."
        />
      </label>
      {patternMismatch?.has_mismatch ? (
        <p className="mt-2 text-xs text-amber-900">
          This order has leftover pattern jobs for fabrics already removed from the sales
          order. Those leftover jobs will be cancelled if you delete the fabric.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-800">{error}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="bg-amber-700 hover:bg-amber-800"
          disabled={submitting}
          onClick={() => void postAction("request_delete")}
        >
          {submitting ? "Sending..." : "Send request"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={submitting}
          onClick={() => {
            setConfirming(false);
            setError(null);
            setReason("");
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
