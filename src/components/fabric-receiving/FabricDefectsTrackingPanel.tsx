"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type {
  FabricDefectListItem,
  FabricDefectStatus,
  FabricDefectSummary,
} from "@/lib/types/fabric-receipts";
import { cn } from "@/lib/utils";

type FabricDefectsTrackingPanelProps = {
  reloadKey: number;
  onMessage: (message: string | null) => void;
  onError: (error: string | null) => void;
  onChanged: () => void;
};

type StatusFilter = FabricDefectStatus | "all";

function photoUrl(receiptId: string, photoId: string): string {
  return `/api/fabric-receiving/defects/${receiptId}/photos/${photoId}`;
}

export function FabricDefectsTrackingPanel({
  reloadKey,
  onMessage,
  onError,
  onChanged,
}: FabricDefectsTrackingPanelProps) {
  const [canView, setCanView] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [items, setItems] = useState<FabricDefectListItem[]>([]);
  const [summary, setSummary] = useState<FabricDefectSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => setCanView(Boolean(data.is_admin || data.is_client_manager)))
      .catch(() => setCanView(false));
  }, []);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/fabric-receiving/defects?status=${status}&t=${Date.now()}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to load defects");
      const data = (await res.json()) as { items: FabricDefectListItem[]; summary: FabricDefectSummary };
      setItems(data.items);
      setSummary(data.summary);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [canView, status]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  if (!canView) return null;

  async function updateStatus(item: FabricDefectListItem, action: "acknowledge" | "resolve") {
    setActingId(item.defect.id);
    onError(null);
    onMessage(null);
    try {
      const res = await fetch(
        `/api/fabric-receiving/defects/${item.receipt_id}/${item.defect.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      onMessage(action === "acknowledge" ? "Defect acknowledged." : "Defect resolved.");
      onChanged();
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update defect");
    } finally {
      setActingId(null);
    }
  }

  const filters: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "open", label: "Open" },
    { id: "acknowledged", label: "Acknowledged" },
    { id: "resolved", label: "Resolved" },
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <h2 className="text-lg font-semibold text-slate-900">Defects / Issues</h2>
      <p className="mt-1 text-sm text-slate-500">
        Track every fabric defect report — photos, notes, and whether receiving caught it.
      </p>

      {summary && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Open", value: summary.open },
            { label: "Acknowledged", value: summary.acknowledged },
            { label: "Resolved", value: summary.resolved },
            { label: "At receive", value: summary.found_at_receiving },
            { label: "At cutting", value: summary.found_at_cutting },
            { label: "Task misses", value: summary.task_team_misses },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{stat.label}</p>
              <p className="text-xl font-semibold text-slate-900">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setStatus(filter.id)}
            className={cn(
              "min-h-10 rounded-full px-3 py-1.5 text-sm font-medium",
              status === filter.id
                ? "bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-slate-500">No defect reports for this filter.</p>
        )}
        {!loading && items.length > 0 && (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
            {items.map((item) => {
              const key = `${item.receipt_id}-${item.defect.id}`;
              const isOpen = expandedId === key;
              return (
                <li key={key} className="px-4 py-3">
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-start justify-between gap-2 text-left"
                    onClick={() => setExpandedId(isOpen ? null : key)}
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {item.client_name} · {item.so_number} · {item.fabric_number}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-600">
                        <span className="capitalize">{item.defect.status}</span>
                        {" · "}
                        found at {item.defect.found_at}
                        {item.defect.task_team_miss ? " · task miss" : ""}
                        {item.defect.defect_type ? ` · ${item.defect.defect_type}` : ""}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-800">{item.defect.note}</p>
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(item.defect.reported_at).toLocaleDateString()}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                      <p className="text-xs text-slate-500">
                        Reporter: {item.defect.reported_by}
                        {item.defect.acknowledged_by
                          ? ` · Ack: ${item.defect.acknowledged_by}`
                          : ""}
                        {item.defect.resolved_by ? ` · Resolved: ${item.defect.resolved_by}` : ""}
                      </p>
                      {item.defect.photos.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {item.defect.photos.map((photo) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={photo.id}
                              src={photoUrl(item.receipt_id, photo.id)}
                              alt={photo.filename}
                              className="h-24 w-24 rounded-lg object-cover"
                            />
                          ))}
                        </div>
                      )}
                      {item.defect.status !== "resolved" && (
                        <div className="flex flex-wrap gap-2">
                          {item.defect.status === "open" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={actingId === item.defect.id}
                              onClick={() => void updateStatus(item, "acknowledge")}
                            >
                              Acknowledge
                            </Button>
                          )}
                          <Button
                            size="sm"
                            disabled={actingId === item.defect.id}
                            onClick={() => void updateStatus(item, "resolve")}
                          >
                            Resolve
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
