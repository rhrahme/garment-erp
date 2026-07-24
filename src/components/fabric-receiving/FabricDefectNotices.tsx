"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { FabricDefectListItem, FabricDefectSummary } from "@/lib/types/fabric-receipts";
import { cn } from "@/lib/utils";

type FabricDefectNoticesProps = {
  reloadKey: number;
  onMessage: (message: string | null) => void;
  onError: (error: string | null) => void;
  onChanged: () => void;
};

function photoUrl(receiptId: string, photoId: string | null): string | null {
  if (!photoId) return null;
  return `/api/fabric-receiving/defects/${receiptId}/photos/${photoId}`;
}

export function FabricDefectNotices({
  reloadKey,
  onMessage,
  onError,
  onChanged,
}: FabricDefectNoticesProps) {
  const [canView, setCanView] = useState(false);
  const [canManageStatus, setCanManageStatus] = useState(false);
  const [items, setItems] = useState<FabricDefectListItem[]>([]);
  const [summary, setSummary] = useState<FabricDefectSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        setCanView(
          Boolean(data.is_admin || data.is_client_manager || data.is_production_operator)
        );
        setCanManageStatus(Boolean(data.is_admin || data.is_client_manager));
      })
      .catch(() => {
        setCanView(false);
        setCanManageStatus(false);
      });
  }, []);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/fabric-receiving/defects?status=open&t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load open defects");
      const data = (await res.json()) as { items: FabricDefectListItem[]; summary: FabricDefectSummary };
      setItems(data.items);
      setSummary(data.summary);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  if (!canView) return null;

  const openCount = items.length;

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

  return (
    <section
      className={cn(
        "rounded-xl border px-5 py-4",
        openCount > 0
          ? "border-rose-300 bg-rose-50 shadow-sm ring-1 ring-rose-200"
          : "border-slate-200 bg-white"
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle
            className={cn("mt-0.5 h-5 w-5 shrink-0", openCount > 0 ? "text-rose-700" : "text-slate-400")}
          />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Open fabric defects
              {openCount > 0 && (
                <span className="ml-2 inline-flex min-w-7 items-center justify-center rounded-full bg-rose-600 px-2 py-0.5 text-sm font-bold text-white">
                  {openCount}
                </span>
              )}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {openCount === 0
                ? "No open issues — QC notice stays quiet."
                : "Needs QC attention. Cutting finds are flagged as task team misses."}
            </p>
            {summary && openCount > 0 && (
              <p className="mt-1 text-xs text-rose-900/80">
                Caught at receive:{" "}
                {items.filter((item) => item.defect.found_at === "receiving").length} · Missed until
                cutting: {items.filter((item) => item.defect.task_team_miss).length}
              </p>
            )}
          </div>
        </div>
        <span className="text-sm text-slate-500">{expanded ? "Hide" : "Show"}</span>
      </button>

      {expanded && (
        <div className="mt-4">
          {loading && <p className="text-sm text-slate-500">Loading…</p>}
          {!loading && openCount === 0 && (
            <p className="flex items-center gap-2 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              All clear.
            </p>
          )}
          {!loading && openCount > 0 && (
            <ul className="space-y-3">
              {items.map((item) => {
                const thumb = photoUrl(item.receipt_id, item.thumbnail_photo_id);
                return (
                  <li
                    key={`${item.receipt_id}-${item.defect.id}`}
                    className="rounded-xl border border-rose-200 bg-white p-3"
                  >
                    <div className="flex gap-3">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          className="h-16 w-16 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
                          No photo
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">
                          {item.client_name} · {item.so_number}
                        </p>
                        <p className="text-sm text-slate-700">
                          {item.fabric_number} · {item.garment_type}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Found at{" "}
                          <span className="font-semibold capitalize">{item.defect.found_at}</span>
                          {item.defect.task_team_miss && (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
                              Task team miss
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-sm text-slate-800">{item.defect.note}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.defect.reported_by} ·{" "}
                          {new Date(item.defect.reported_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {canManageStatus && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={actingId === item.defect.id}
                          onClick={() => void updateStatus(item, "acknowledge")}
                        >
                          Acknowledge
                        </Button>
                        <Button
                          size="sm"
                          disabled={actingId === item.defect.id}
                          onClick={() => void updateStatus(item, "resolve")}
                        >
                          Resolve
                        </Button>
                      </div>
                    )}
                    {!canManageStatus && (
                      <p className="mt-3 text-xs font-medium text-rose-800">
                        Flagged for QC — acknowledge/resolve is on the QC account.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
