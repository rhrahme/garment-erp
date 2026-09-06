"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PATTERN_HOWTO_NOTICES } from "@/lib/pattern/pattern-operator-notice-copy";
import type { PatternOperatorNotice } from "@/lib/types/pattern-operator-notices";

const TEAM_HOWTOS = PATTERN_HOWTO_NOTICES.filter((howto) => howto.audience === "all_teams");

function mergeTeamHowTos(openIds: Set<string>): PatternOperatorNotice[] {
  return TEAM_HOWTOS.map((howto) => ({
    id: howto.id,
    created_at: "",
    created_by: "system",
    title: howto.title,
    body: howto.body,
    href: howto.href,
    href_label: howto.href_label,
    status: openIds.has(howto.id) ? "open" : "acknowledged",
    acknowledged_at: null,
    acknowledged_by: null,
    emailed_at: null,
  }));
}

/** All-teams how-tos stay on every team's How-to tab after Got it. */
export function TeamHowToTab() {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/team-notices", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { notices?: PatternOperatorNotice[] };
      setOpenIds(
        Array.isArray(data.notices) ? data.notices.map((notice) => notice.id) : []
      );
    } catch {
      /* keep last good list */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => mergeTeamHowTos(new Set(openIds)), [openIds]);

  async function acknowledge(id: string) {
    setActingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/team-notices/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to acknowledge.");
      setOpenIds((current) => current.filter((noticeId) => noticeId !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to acknowledge.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <Card className="border-indigo-200 bg-indigo-50/40 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-indigo-950">
          <BookOpen className="h-4 w-4 text-indigo-600" />
          How-to for every team
        </CardTitle>
        <p className="text-xs text-indigo-800/80">
          English + Bangla. New ones also land on your email and at the top of every ERP page
          until you tap Got it. They stay here after that.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {rows.map((notice) => (
          <div
            key={notice.id}
            className="rounded-xl border border-indigo-200 bg-white px-4 py-3 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">{notice.title}</p>
              {notice.status === "open" ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                  New
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  Saved
                </span>
              )}
            </div>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
              {notice.body}
            </pre>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {notice.href ? (
                <Link
                  href={notice.href}
                  className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"
                >
                  {notice.href_label ?? "Open"}
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              ) : null}
              {notice.status === "open" ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void acknowledge(notice.id)}
                  disabled={actingId === notice.id}
                  className="ml-auto gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {actingId === notice.id ? "Saving..." : "Got it"}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
