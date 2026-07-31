"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Trash2 } from "lucide-react";
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

export function FabricLineDeleteRequestsPanelClient({
  initialRequests,
}: FabricLineDeleteRequestsPanelClientProps) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function act(
    request: FabricLineDeleteRequestSummary,
    action: "keep" | "confirm_delete",
    forceCancelOrphanJobs = false
  ) {
    const key = `${request.sales_order_id}:${request.line_id}`;
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
            await act(request, action, true);
            return;
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
      if (action === "confirm_delete" && data.supplier_follow_up_needed) {
        setNotes((current) => ({
          ...current,
          [key]: `${data.po_number ?? "PO"} was already emailed ù contact the supplier if they should not ship.`,
        }));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process request");
    } finally {
      setActingKey(null);
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
              { key: "when", label: "When" },
              { key: "order", label: "Order" },
              { key: "fabric", label: "Fabric" },
              { key: "po", label: "PO" },
              { key: "by", label: "By" },
              { key: "actions", label: "Admin" },
            ]}
            rows={requests.map((request) => {
              const key = `${request.sales_order_id}:${request.line_id}`;
              return {
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
                    {request.article_label} ù {request.fabric_number}
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {request.garment_type} ù {request.quantity}
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
                    {request.po_number ?? "ù"}
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
                      disabled={actingKey === key}
                      onClick={() => void act(request, "confirm_delete")}
                    >
                      OK
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={actingKey === key}
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
