"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/PageHeader";
import type {
  FabricChangeAlert,
  FabricChangeAlertRole,
} from "@/lib/types/fabric-change-alerts";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type FabricChangeAlertsPanelClientProps = {
  initialAlerts: FabricChangeAlert[];
  role: FabricChangeAlertRole;
  /** Compact strip for client folder embedding. */
  compact?: boolean;
  title?: string;
};

export function FabricChangeAlertsPanelClient({
  initialAlerts,
  role,
  compact = false,
  title = "Fabric changes - reprint stickers & A4",
}: FabricChangeAlertsPanelClientProps) {
  const router = useRouter();
  const [alerts, setAlerts] = useState(initialAlerts);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingForRole = alerts.filter((alert) => !alert.acknowledgements[role]);

  async function acknowledge(alertId: string) {
    setActingId(alertId);
    setError(null);
    try {
      const res = await fetch(`/api/fabric-change-alerts/${alertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge" }),
      });
      const data = (await res.json()) as { error?: string; alert?: FabricChangeAlert };
      if (!res.ok) throw new Error(data.error ?? "Failed to acknowledge");

      setAlerts((current) =>
        current
          .map((alert) => (alert.id === alertId ? data.alert! : alert))
          .filter((alert) => !alert.acknowledgements[role])
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to acknowledge");
    } finally {
      setActingId(null);
    }
  }

  async function acknowledgeAll() {
    const pending = alerts.filter((alert) => !alert.acknowledgements[role]);
    for (const alert of pending) {
      await acknowledge(alert.id);
    }
  }

  if (alerts.length === 0) {
    return null;
  }

  return (
    <Card
      id="fabric-change-alerts"
      className={cn(
        compact ? "mb-4" : "mb-8",
        pendingForRole.length > 0 && "border-amber-400 bg-amber-50/40 shadow-sm ring-1 ring-amber-200"
      )}
    >
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Printer className="h-5 w-5 text-amber-600" />
              {title}
              {pendingForRole.length > 0 ? (
                <Badge className="border border-amber-300 bg-amber-100 text-amber-900">
                  {pendingForRole.length} need reprint check
                </Badge>
              ) : (
                <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-800">
                  <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
                  Handled for your role
                </Badge>
              )}
            </CardTitle>
            {pendingForRole.length > 0 ? (
              <p className="flex items-start gap-2 text-sm font-medium text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Fabric changed on these orders - reprint stickers and A4 if already printed.
              </p>
            ) : null}
          </div>
          {pendingForRole.length > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={actingId !== null}
              onClick={() => void acknowledgeAll()}
            >
              Acknowledge all
            </Button>
          ) : null}
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </CardHeader>
      <CardContent className="p-0">
        <DataTable
          columns={[
            { key: "when", label: "When" },
            { key: "order", label: "Order" },
            { key: "client", label: "Client" },
            { key: "change", label: "Change" },
            { key: "status", label: "Status" },
          ]}
          rows={alerts.map((alert) => ({
            when: (
              <span className="text-xs text-slate-600">{formatDateTime(alert.created_at)}</span>
            ),
            order: (
              <Link
                href={`/orders/${alert.sales_order_id}`}
                className="font-medium text-indigo-700 hover:underline"
              >
                {alert.so_number}
              </Link>
            ),
            client: (
              <span className="text-sm">
                {alert.client_name}
                <span className="block text-xs text-slate-500">{alert.client_code}</span>
              </span>
            ),
            change: (
              <span className="text-sm">
                {alert.article_number != null
                  ? `L${String(alert.article_number).padStart(2, "0")} - `
                  : ""}
                {alert.summary}
              </span>
            ),
            status: alert.acknowledgements[role] ? (
              <span className="text-xs text-emerald-700">Handled</span>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={actingId === alert.id}
                onClick={() => void acknowledge(alert.id)}
              >
                Acknowledge
              </Button>
            ),
          }))}
        />
      </CardContent>
    </Card>
  );
}
