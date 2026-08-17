"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, UserPen } from "lucide-react";
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
  const [error, setError] = useState<string | null>(null);

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
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process request");
    } finally {
      setActingId(null);
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
      </CardHeader>
      <CardContent className="p-0">
        <DataTable
          columns={[
            { key: "when", label: "When" },
            { key: "client", label: "Client" },
            { key: "proposed", label: "Proposed name" },
            { key: "by", label: "By" },
            { key: "actions", label: "Admin" },
          ]}
          rows={requests.map((request) => ({
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
                  disabled={actingId === request.client_id}
                  onClick={() => void act(request, "approve")}
                >
                  OK
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={actingId === request.client_id}
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
