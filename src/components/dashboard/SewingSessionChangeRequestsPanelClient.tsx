"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Scissors } from "lucide-react";
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
  employee_name: string | null;
  so_number: string | null;
  requested_by: string;
  requested_at: string;
  reason: string | null;
};

type SewingSessionChangeRequestsPanelClientProps = {
  initialRequests: RequestSummary[];
};

export function SewingSessionChangeRequestsPanelClient({
  initialRequests,
}: SewingSessionChangeRequestsPanelClientProps) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function act(request: RequestSummary, action: "approve" | "reject") {
    setActingId(request.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/sewing-session/change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          request_id: request.id,
        }),
      });
      const data = (await res.json()) as { error?: string; detail?: string | null };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to process request");
      }
      setRequests((current) => current.filter((row) => row.id !== request.id));
      if (action === "approve" && data.detail) {
        setNotes((current) => ({ ...current, [request.id]: data.detail! }));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process request");
    } finally {
      setActingId(null);
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
                Stitch/Pattern asked to edit, stop, delete, or pause kiosk scan history. Confirm
                applies the change; Reject keeps current data.
              </p>
            ) : null}
          </div>
          <Link href="/stitch?tab=live" className="text-sm font-medium text-indigo-700 hover:underline">
            Open stitch Live
          </Link>
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
              { key: "action", label: "Action" },
              { key: "target", label: "Target" },
              { key: "by", label: "By" },
              { key: "actions", label: "Admin" },
            ]}
            rows={requests.map((request) => ({
              when: (
                <span className="text-xs text-slate-600">
                  {formatDateTime(request.requested_at)}
                </span>
              ),
              action: <span className="font-semibold capitalize">{request.action.replace(/_/g, " ")}</span>,
              target: (
                <span className="text-sm">
                  {request.label}
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {[request.employee_name, request.so_number, request.fabric_number]
                      .filter(Boolean)
                      .join(" | ") || "-"}
                  </span>
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
                    disabled={actingId === request.id}
                    onClick={() => void act(request, "approve")}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={actingId === request.id}
                    onClick={() => void act(request, "reject")}
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
