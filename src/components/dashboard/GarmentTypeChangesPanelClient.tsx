"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRightLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/PageHeader";
import type { GarmentTypeChange } from "@/lib/types/garment-type-changes";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type GarmentTypeChangesPanelClientProps = {
  initialChanges: GarmentTypeChange[];
};

export function GarmentTypeChangesPanelClient({
  initialChanges,
}: GarmentTypeChangesPanelClientProps) {
  const router = useRouter();
  const [changes, setChanges] = useState(initialChanges);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingCount = changes.filter((change) => !change.acknowledged_at).length;

  async function acknowledge(changeId: string) {
    setActingId(changeId);
    setError(null);
    try {
      const res = await fetch(`/api/garment-type-changes/${changeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge" }),
      });
      const data = (await res.json()) as { error?: string; change?: GarmentTypeChange };
      if (!res.ok) throw new Error(data.error ?? "Failed to acknowledge");

      setChanges((current) =>
        current.map((change) => (change.id === changeId ? data.change! : change))
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to acknowledge");
    } finally {
      setActingId(null);
    }
  }

  async function acknowledgeAll() {
    const pending = changes.filter((change) => !change.acknowledged_at);
    for (const change of pending) {
      await acknowledge(change.id);
    }
  }

  if (changes.length === 0) {
    return null;
  }

  return (
    <Card
      id="garment-type-changes"
      className={cn(
        "mb-8",
        pendingCount > 0 && "border-amber-400 bg-amber-50/40 shadow-sm ring-1 ring-amber-200"
      )}
    >
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-amber-600" />
              Garment type changes
              {pendingCount > 0 ? (
                <Badge className="border border-amber-300 bg-amber-100 text-amber-900">
                  {pendingCount} need review
                </Badge>
              ) : (
                <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-800">
                  <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
                  All reviewed
                </Badge>
              )}
            </CardTitle>
            {pendingCount > 0 ? (
              <p className="flex items-start gap-2 text-sm font-medium text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Pattern, QC, or factory staff changed stitch types — review and acknowledge so
                labels and production stay aligned.
              </p>
            ) : null}
          </div>
          {pendingCount > 0 ? (
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
            { key: "fabric", label: "Fabric" },
            { key: "change", label: "Change" },
            { key: "by", label: "By" },
            { key: "status", label: "Status" },
          ]}
          rows={changes.map((change) => ({
            when: (
              <span className="text-xs text-slate-600">{formatDateTime(change.changed_at)}</span>
            ),
            order: (
              <Link
                href={`/orders/${change.sales_order_id}`}
                className="font-medium text-indigo-700 hover:underline"
              >
                {change.so_number}
              </Link>
            ),
            fabric: (
              <span className="text-sm">
                L{String(change.article_number).padStart(2, "0")} · {change.fabric_number}
              </span>
            ),
            change: (
              <span className="text-sm font-medium">
                {change.from_garment_type} → {change.to_garment_type}
              </span>
            ),
            by: <span className="text-xs text-slate-600">{change.changed_by}</span>,
            status: change.acknowledged_at ? (
              <span className="text-xs text-emerald-700">Reviewed</span>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={actingId === change.id}
                onClick={() => void acknowledge(change.id)}
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
