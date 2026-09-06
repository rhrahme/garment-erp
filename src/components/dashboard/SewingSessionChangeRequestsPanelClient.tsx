"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Scissors } from "lucide-react";
import { AdminPendingSelectBar } from "@/components/dashboard/AdminPendingSelectBar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/PageHeader";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type RequestSummary = {
  id: string;
  action: string;
  status: string;
  session_id: string | null;
  failure_id: string | null;
  label: string;
  production_code: string | null;
  fabric_number: string | null;
  garment_type: string | null;
  employee_name: string | null;
  so_number: string | null;
  client_name: string | null;
  source_client_name: string | null;
  destination_client_name: string | null;
  client_label: string | null;
  started_at: string | null;
  requested_by: string;
  requested_at: string;
  reason: string | null;
};

type SewingSessionChangeRequestsPanelClientProps = {
  initialRequests: RequestSummary[];
};

type DecideResponse = {
  error?: string;
  detail?: string | null;
  details?: string[];
  results?: Array<{ request_id: string; ok: boolean; error?: string; detail?: string | null }>;
};

export function SewingSessionChangeRequestsPanelClient({
  initialRequests,
}: SewingSessionChangeRequestsPanelClientProps) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [actingId, setActingId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = requests.length > 0 && requests.every((row) => selected.has(row.id));
  const selectedRequests = useMemo(
    () => requests.filter((row) => selected.has(row.id)),
    [requests, selected]
  );
  const busy = batchBusy || actingId !== null;

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(requests.map((row) => row.id)));
  }

  async function decide(targets: RequestSummary[], action: "approve" | "reject") {
    if (targets.length === 0) return;
    setError(null);
    if (targets.length === 1) setActingId(targets[0].id);
    else setBatchBusy(true);
    try {
      const res = await fetch("/api/admin/sewing-session/change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          request_ids: targets.map((row) => row.id),
        }),
      });
      const data = (await res.json()) as DecideResponse;
      if (!res.ok && !data.results) {
        throw new Error(data.error ?? "Failed to process request");
      }

      const okIds = new Set<string>();
      const failMessages: string[] = [];
      if (data.results && data.results.length > 0) {
        for (const row of data.results) {
          if (row.ok) okIds.add(row.request_id);
          else failMessages.push(row.error ?? "Failed to process request");
        }
      } else if (res.ok) {
        for (const row of targets) okIds.add(row.id);
      } else {
        throw new Error(data.error ?? "Failed to process request");
      }

      setRequests((current) => current.filter((row) => !okIds.has(row.id)));
      setSelected((current) => {
        const next = new Set(current);
        for (const id of okIds) next.delete(id);
        return next;
      });

      const extraNotes = [
        ...(data.details ?? []),
        ...(data.detail && !(data.details ?? []).includes(data.detail) ? [data.detail] : []),
      ].filter((note): note is string => Boolean(note));
      if (action === "approve" && extraNotes.length > 0) {
        setNotes((current) => {
          const next = { ...current };
          extraNotes.forEach((note, index) => {
            next[`${targets[0]?.id ?? "batch"}-${index}`] = note;
          });
          return next;
        });
      }

      if (failMessages.length > 0) {
        setError(
          failMessages.length === 1
            ? failMessages[0]
            : `${failMessages.length} of ${targets.length} failed. ${failMessages[0]}`
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process request");
    } finally {
      setActingId(null);
      setBatchBusy(false);
    }
  }

  if (requests.length === 0 && Object.keys(notes).length === 0) {
    return null;
  }

  return (
    <Card
      id="sewing-session-change-requests"
      className={cn(
        "mb-8",
        requests.length > 0 && "border-amber-400 bg-amber-50/40 shadow-sm ring-1 ring-amber-200"
      )}
    >
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Scissors className="h-5 w-5 text-amber-600" />
              Stitch kiosk change requests
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
                Stitch/Pattern asked to edit, stop, delete, or pause kiosk scan history.
                Overtime scans after 10 PM are already logged - Confirm counts them,
                Reject keeps the log but drops Performance hours. Started without QR
                and corrected start times are already applied - Confirm acknowledges;
                Reject does not change the session.
              </p>
            ) : null}
          </div>
          <Link href="/stitch?tab=live" className="text-sm font-medium text-indigo-700 hover:underline">
            Open stitch Live
          </Link>
        </div>
        {requests.length > 0 ? (
          <div className="mt-3">
            <AdminPendingSelectBar
              total={requests.length}
              selectedCount={selectedRequests.length}
              allSelected={allSelected}
              busy={busy}
              confirmLabel="Confirm"
              rejectLabel="Reject"
              confirmClassName="bg-red-700 hover:bg-red-800"
              onToggleAll={toggleAll}
              onConfirmSelected={() => void decide(selectedRequests, "approve")}
              onRejectSelected={() => void decide(selectedRequests, "reject")}
              onConfirmAll={() => void decide(requests, "approve")}
              onRejectAll={() => void decide(requests, "reject")}
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
                    aria-label="Select all stitch change requests"
                    className="h-4 w-4 rounded border-slate-300"
                  />
                ),
                className: "w-10",
              },
              { key: "when", label: "When" },
              { key: "action", label: "Action" },
              { key: "target", label: "Target" },
              { key: "by", label: "By" },
              { key: "actions", label: "Admin" },
            ]}
            rows={requests.map((request) => ({
              select: (
                <input
                  type="checkbox"
                  checked={selected.has(request.id)}
                  onChange={() => toggleOne(request.id)}
                  disabled={busy}
                  aria-label={`Select ${request.label}`}
                  className="h-4 w-4 rounded border-slate-300"
                />
              ),
              when: (
                <span className="text-xs text-slate-600">
                  {formatDateTime(request.requested_at)}
                </span>
              ),
              action: <span className="font-semibold capitalize">{request.action.replace(/_/g, " ")}</span>,
              target: (
                <span className="text-sm">
                  {request.label}
                  {request.client_label ? (
                    <span className="mt-0.5 block font-semibold text-slate-900">
                      {request.client_label}
                    </span>
                  ) : null}
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {[
                      request.employee_name,
                      request.so_number,
                      request.fabric_number,
                      request.garment_type,
                    ]
                      .filter(Boolean)
                      .join(" | ") || "-"}
                  </span>
                  {(request.action === "started_without_qr" ||
                    request.action === "correct_start_time") &&
                  request.started_at ? (
                    <span className="mt-0.5 block text-xs font-semibold text-amber-900">
                      Started {formatDateTime(request.started_at)}
                    </span>
                  ) : null}
                  {request.reason ? (
                    <span className="mt-0.5 block text-xs text-slate-600">{request.reason}</span>
                  ) : null}
                </span>
              ),
              by: <span className="text-xs text-slate-600">{request.requested_by}</span>,
              actions: (
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    className="bg-red-700 hover:bg-red-800"
                    disabled={busy}
                    onClick={() => void decide([request], "approve")}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void decide([request], "reject")}
                  >
                    Reject
                  </Button>
                </div>
              ),
            }))}
          />
        </CardContent>
      ) : null}
    </Card>
  );
}
