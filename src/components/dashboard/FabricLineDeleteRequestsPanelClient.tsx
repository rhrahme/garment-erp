"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Trash2 } from "lucide-react";
import { AdminPendingSelectBar } from "@/components/dashboard/AdminPendingSelectBar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/PageHeader";
import type { FabricLineDeleteRequestSummary } from "@/lib/sales-orders/fabric-line-delete-request-list";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type FabricLineDeleteRequestsPanelClientProps = {
  initialRequests: FabricLineDeleteRequestSummary[];
};

function fabricDeleteRowKey(request: FabricLineDeleteRequestSummary) {
  return `${request.sales_order_id}:${request.line_id}`;
}

export function FabricLineDeleteRequestsPanelClient({
  initialRequests,
}: FabricLineDeleteRequestsPanelClientProps) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected =
    requests.length > 0 && requests.every((row) => selected.has(fabricDeleteRowKey(row)));
  const selectedRequests = useMemo(
    () => requests.filter((row) => selected.has(fabricDeleteRowKey(row))),
    [requests, selected]
  );
  const busy = batchBusy || actingKey !== null;

  function toggleOne(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(requests.map(fabricDeleteRowKey)));
  }

  async function act(
    request: FabricLineDeleteRequestSummary,
    action: "keep" | "confirm_delete",
    forceCancelOrphanJobs = false
  ) {
    const key = fabricDeleteRowKey(request);
    setActingKey(key);
    setError(null);
    try {
      const res = await fetch(
        `/api/sales-orders/${request.sales_order_id}/fabric-lines/delete-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            line_id: request.line_id,
            force_cancel_orphan_jobs: forceCancelOrphanJobs,
          }),
        }
      );
      const data = (await res.json()) as {
        error?: string;
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
            setActingKey(null);
            return act(request, action, true);
          }
        }
        throw new Error(data.error ?? "Failed to process request");
      }

      setRequests((current) =>
        current.filter(
          (entry) =>
            !(
              entry.sales_order_id === request.sales_order_id &&
              entry.line_id === request.line_id
            )
        )
      );
      setSelected((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      if (action === "confirm_delete" && data.supplier_follow_up_needed) {
        setNotes((current) => ({
          ...current,
          [key]: `${data.po_number ?? "PO"} was already emailed - contact the supplier if they should not ship.`,
        }));
      }
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process request");
      return false;
    } finally {
      setActingKey(null);
    }
  }

  async function actSelected(
    action: "keep" | "confirm_delete",
    targets: FabricLineDeleteRequestSummary[] = selectedRequests
  ) {
    if (targets.length === 0) return;
    setBatchBusy(true);
    setError(null);
    try {
      for (const request of targets) {
        const ok = await act(request, action);
        if (!ok) break;
      }
    } finally {
      setBatchBusy(false);
    }
  }

  if (requests.length === 0 && Object.keys(notes).length === 0) {
    return null;
  }

  return (
    <Card
      id="fabric-line-delete-requests"
      className={cn(
        "mb-8",
        requests.length > 0 && "border-amber-400 bg-amber-50/40 shadow-sm ring-1 ring-amber-200"
      )}
    >
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Trash2 className="h-5 w-5 text-amber-600" />
              Fabric delete requests
              {requests.length > 0 ? (
                <Badge className="border border-amber-300 bg-amber-100 text-amber-900">
                  {requests.length} pending
                </Badge>
              ) : (
                <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-800">
                  Cleared
                </Badge>
              )}
            </CardTitle>
            {requests.length > 0 ? (
              <p className="flex items-start gap-2 text-sm font-medium text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                QC/sales asked to remove PO-locked fabric lines. OK removes the SO line and cancels
                PO linkage; Not keeps the line.
              </p>
            ) : null}
          </div>
        </div>
        {requests.length > 0 ? (
          <div className="mt-3">
            <AdminPendingSelectBar
              total={requests.length}
              selectedCount={selectedRequests.length}
              allSelected={allSelected}
              busy={busy}
              confirmLabel="OK"
              rejectLabel="Not"
              confirmClassName="bg-red-700 hover:bg-red-800"
              onToggleAll={toggleAll}
              onConfirmSelected={() => void actSelected("confirm_delete")}
              onRejectSelected={() => void actSelected("keep")}
              onConfirmAll={() => void actSelected("confirm_delete", requests)}
              onRejectAll={() => void actSelected("keep", requests)}
            />
          </div>
        ) : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        {Object.values(notes).map((note) => (
          <p key={note} className="mt-2 text-sm text-amber-800">
            {note}
          </p>
        ))}
      </CardHeader>
      {requests.length > 0 ? (
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "select",
                label: (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={busy}
                    aria-label="Select all fabric delete requests"
                    className="h-4 w-4 rounded border-slate-300"
                  />
                ),
                className: "w-10",
              },
              { key: "when", label: "When" },
              { key: "order", label: "Order" },
              { key: "fabric", label: "Fabric" },
              { key: "po", label: "PO" },
              { key: "by", label: "By" },
              { key: "actions", label: "Admin" },
            ]}
            rows={requests.map((request) => {
              const key = fabricDeleteRowKey(request);
              return {
                select: (
                  <input
                    type="checkbox"
                    checked={selected.has(key)}
                    onChange={() => toggleOne(key)}
                    disabled={busy}
                    aria-label={`Select ${request.so_number} ${request.fabric_number}`}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                ),
                when: (
                  <span className="text-xs text-slate-600">
                    {formatDateTime(request.delete_requested_at)}
                  </span>
                ),
                order: (
                  <Link
                    href={`/orders/${request.sales_order_id}`}
                    className="font-medium text-indigo-700 hover:underline"
                  >
                    {request.so_number}
                  </Link>
                ),
                fabric: (
                  <span className="text-sm">
                    {request.article_label} | {request.fabric_number}
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {request.garment_type} | {request.quantity}
                      {request.unit === "meters" ? "m" : ` ${request.unit}`}
                    </span>
                    {request.delete_request_reason ? (
                      <span className="mt-0.5 block text-xs text-slate-600">
                        {request.delete_request_reason}
                      </span>
                    ) : null}
                  </span>
                ),
                po: (
                  <span className="text-xs text-slate-700">
                    {request.po_number ?? "-"}
                    {request.po_line_emailed ? (
                      <span className="mt-0.5 block text-amber-800">Emailed</span>
                    ) : request.po_number ? (
                      <span className="mt-0.5 block text-slate-500">Not emailed</span>
                    ) : null}
                  </span>
                ),
                by: <span className="text-xs text-slate-600">{request.delete_requested_by}</span>,
                actions: (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      className="bg-red-700 hover:bg-red-800"
                      disabled={busy}
                      onClick={() => void act(request, "confirm_delete")}
                    >
                      OK
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void act(request, "keep")}
                    >
                      Not
                    </Button>
                  </div>
                ),
              };
            })}
          />
        </CardContent>
      ) : null}
    </Card>
  );
}
