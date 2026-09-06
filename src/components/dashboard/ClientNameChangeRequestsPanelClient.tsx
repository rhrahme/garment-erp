"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, UserPen } from "lucide-react";
import { AdminPendingSelectBar } from "@/components/dashboard/AdminPendingSelectBar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/PageHeader";
import type { ClientNameChangeRequestSummary } from "@/lib/clients/name-change-requests";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type ClientNameChangeRequestsPanelClientProps = {
  initialRequests: ClientNameChangeRequestSummary[];
};

export function ClientNameChangeRequestsPanelClient({
  initialRequests,
}: ClientNameChangeRequestsPanelClientProps) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [actingId, setActingId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = requests.length > 0 && requests.every((row) => selected.has(row.client_id));
  const selectedRequests = useMemo(
    () => requests.filter((row) => selected.has(row.client_id)),
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
    setSelected(allSelected ? new Set() : new Set(requests.map((row) => row.client_id)));
  }

  async function act(request: ClientNameChangeRequestSummary, action: "approve" | "reject") {
    setActingId(request.client_id);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${request.client_id}/name-change-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to process request");
      }
      setRequests((current) => current.filter((entry) => entry.client_id !== request.client_id));
      setSelected((current) => {
        const next = new Set(current);
        next.delete(request.client_id);
        return next;
      });
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process request");
      return false;
    } finally {
      setActingId(null);
    }
  }

  async function actSelected(action: "approve" | "reject") {
    if (selectedRequests.length === 0) return;
    setBatchBusy(true);
    setError(null);
    try {
      for (const request of selectedRequests) {
        const ok = await act(request, action);
        if (!ok) break;
      }
    } finally {
      setBatchBusy(false);
    }
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <Card
      id="client-name-change-requests"
      className={cn("mb-8", "border-amber-400 bg-amber-50/40 shadow-sm ring-1 ring-amber-200")}
    >
      <CardHeader>
        <div className="space-y-2">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <UserPen className="h-5 w-5 text-amber-600" />
            Client name change requests
            <Badge className="border border-amber-300 bg-amber-100 text-amber-900">
              {requests.length} pending
            </Badge>
          </CardTitle>
          <p className="flex items-start gap-2 text-sm font-medium text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            QC asked to rename a client. OK applies the proposed name; Not keeps the current one.
          </p>
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <div className="mt-3">
          <AdminPendingSelectBar
            total={requests.length}
            selectedCount={selectedRequests.length}
            allSelected={allSelected}
            busy={busy}
            confirmLabel="OK"
            rejectLabel="Not"
            onToggleAll={toggleAll}
            onConfirmSelected={() => void actSelected("approve")}
            onRejectSelected={() => void actSelected("reject")}
          />
        </div>
      </CardHeader>
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
                  aria-label="Select all client name change requests"
                  className="h-4 w-4 rounded border-slate-300"
                />
              ),
              className: "w-10",
            },
            { key: "when", label: "When" },
            { key: "client", label: "Client" },
            { key: "proposed", label: "Proposed name" },
            { key: "by", label: "By" },
            { key: "actions", label: "Admin" },
          ]}
          rows={requests.map((request) => ({
            select: (
              <input
                type="checkbox"
                checked={selected.has(request.client_id)}
                onChange={() => toggleOne(request.client_id)}
                disabled={busy}
                aria-label={`Select ${request.current_name}`}
                className="h-4 w-4 rounded border-slate-300"
              />
            ),
            when: (
              <span className="text-xs text-slate-600">{formatDateTime(request.requested_at)}</span>
            ),
            client: (
              <Link href="/clients" className="font-medium text-indigo-700 hover:underline">
                {request.current_name}
                <span className="mt-0.5 block font-mono text-xs text-slate-500">
                  {request.client_code}
                </span>
              </Link>
            ),
            proposed: <span className="text-sm font-medium">{request.proposed_name}</span>,
            by: <span className="text-xs text-slate-600">{request.requested_by}</span>,
            actions: (
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void act(request, "approve")}
                >
                  OK
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void act(request, "reject")}
                >
                  Not
                </Button>
              </div>
            ),
          }))}
        />
      </CardContent>
    </Card>
  );
}
