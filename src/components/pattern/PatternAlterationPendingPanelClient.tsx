"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Scissors } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { PatternAlterationPendingItem } from "@/lib/types/pattern-alteration-pending";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

const POLL_MS = 15_000;

export function PatternAlterationPendingPanelClient({
  initialItems,
}: {
  initialItems: PatternAlterationPendingItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialItems.map((item) => [item.id, item.stitcher_comments ?? ""])
    )
  );
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch("/api/pattern/alterations/pending", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: PatternAlterationPendingItem[] };
      if (Array.isArray(data.items)) {
        const next = data.items.filter((row) => row.status !== "chart_updated");
        setItems(next);
        setDrafts((prev) => {
          const merged = { ...prev };
          for (const item of next) {
            if (merged[item.id] === undefined) {
              merged[item.id] = item.stitcher_comments ?? "";
            }
          }
          return merged;
        });
      }
    } catch {
      // Keep showing the last good list; next poll retries.
    }
  }, []);

  useEffect(() => {
    setItems(initialItems);
    setDrafts(
      Object.fromEntries(
        initialItems.map((item) => [item.id, item.stitcher_comments ?? ""])
      )
    );
  }, [initialItems]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshList();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshList]);

  async function patch(
    id: string,
    action: "acknowledge" | "chart_updated" | "stitcher_comments",
    stitcher_comments?: string
  ) {
    setActingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/alterations/pending/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, stitcher_comments }),
      });
      const data = (await res.json()) as {
        error?: string;
        item?: PatternAlterationPendingItem;
      };
      if (!res.ok) throw new Error(data.error ?? "Update failed");

      setItems((current) =>
        current
          .map((row) => (row.id === id ? data.item! : row))
          .filter((row) => row.status !== "chart_updated")
      );
      if (data.item) {
        setDrafts((prev) => ({
          ...prev,
          [id]: data.item!.stitcher_comments ?? "",
        }));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setActingId(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <Card
      id="pattern-alteration-pending"
      className={cn(
        "mb-6 border-amber-400 bg-amber-50/40 shadow-sm ring-1 ring-amber-200"
      )}
    >
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Scissors className="h-5 w-5 text-amber-700" />
          Alterations stitched - update charts
          <Badge className="border border-amber-300 bg-amber-100 text-amber-900">
            {items.length} pending
          </Badge>
        </CardTitle>
        <p className="mt-2 flex items-start gap-2 text-sm font-medium text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Add stitcher comments here (they sync onto the Production sheet). Update the
          size chart, then mark chart updated. Same fabric on the SO is listed as related.
        </p>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        {items.map((item) => {
          const related =
            item.related_articles.length > 0
              ? item.related_articles
                  .map((r) => {
                    const art =
                      r.article_number != null
                        ? `L${String(r.article_number).padStart(2, "0")}`
                        : "";
                    const g = r.garment_type?.trim() || "";
                    return [art, g].filter(Boolean).join(" ");
                  })
                  .filter(Boolean)
                  .join(", ")
              : null;
          const sheetHref = item.client_pattern_id
            ? `/pattern/client-patterns/${encodeURIComponent(item.client_pattern_id)}`
            : null;
          const printHref = item.client_pattern_id
            ? `/pattern/client-patterns/${encodeURIComponent(item.client_pattern_id)}/print?sheet=production`
            : null;
          const draft = drafts[item.id] ?? item.stitcher_comments ?? "";
          const dirty = draft.trim() !== (item.stitcher_comments ?? "").trim();

          return (
            <div
              key={item.id}
              className="rounded-lg border border-amber-200 bg-white px-3 py-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-slate-900">
                    {item.production_code}
                    {item.garment_type ? (
                      <span className="font-normal text-slate-600">
                        {" "}
                        - {item.garment_type}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-slate-700">
                    {[item.client_code, item.so_number, item.fabric_number]
                      .filter(Boolean)
                      .join(" - ")}
                  </p>
                  <p className="text-xs text-slate-500">
                    Tailor {item.employee_name} - {formatDateTime(item.created_at)}
                    {item.status === "acknowledged" ? " - seen" : ""}
                  </p>
                  {related ? (
                    <p className="text-xs text-slate-600">
                      Consolidated fabric articles: {related}
                    </p>
                  ) : null}
                  {sheetHref ? (
                    <p className="flex flex-wrap gap-3 text-xs">
                      <Link
                        href={sheetHref}
                        className="inline-flex items-center gap-1 font-medium text-indigo-700 hover:underline"
                      >
                        Open measurement sheet <ExternalLink className="h-3 w-3" />
                      </Link>
                      {printHref ? (
                        <Link
                          href={printHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-indigo-700 hover:underline"
                        >
                          Print Production sheet <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.status === "pending" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={actingId === item.id}
                      onClick={() => void patch(item.id, "acknowledge")}
                    >
                      Acknowledge
                    </Button>
                  ) : (
                    <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-800">
                      <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
                      Seen
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    disabled={actingId === item.id}
                    onClick={() => void patch(item.id, "chart_updated")}
                  >
                    Chart updated
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-2 border-t border-amber-100 pt-3">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Stitcher comments (syncs to Production sheet)
                </label>
                <textarea
                  value={draft}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  rows={2}
                  placeholder="e.g. shorten trousers 2cm / take in seat 1cm"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={actingId === item.id || !dirty}
                    onClick={() => void patch(item.id, "stitcher_comments", draft)}
                  >
                    Save comments
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
