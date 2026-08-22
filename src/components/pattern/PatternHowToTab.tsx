"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ExternalLink, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PATTERN_HOWTO_NOTICES } from "@/lib/pattern/pattern-operator-notice-copy";
import type { PatternOperatorNotice } from "@/lib/types/pattern-operator-notices";

function mergeHowTos(notices: PatternOperatorNotice[]): PatternOperatorNotice[] {
  const byId = new Map(notices.map((notice) => [notice.id, notice]));
  const catalog = PATTERN_HOWTO_NOTICES.map((howto) => {
    const saved = byId.get(howto.id);
    return {
      id: howto.id,
      created_at: saved?.created_at ?? "",
      created_by: saved?.created_by ?? "system",
      title: howto.title,
      body: howto.body,
      href: howto.href === "/pattern/how-to" ? null : howto.href,
      href_label: howto.href === "/pattern/how-to" ? null : howto.href_label,
      status: saved?.status ?? "open",
      acknowledged_at: saved?.acknowledged_at ?? null,
      acknowledged_by: saved?.acknowledged_by ?? null,
      emailed_at: saved?.emailed_at ?? null,
    } satisfies PatternOperatorNotice;
  });
  const extras = notices.filter(
    (notice) => !PATTERN_HOWTO_NOTICES.some((howto) => howto.id === notice.id)
  );
  return [...catalog, ...extras].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return (b.created_at || "").localeCompare(a.created_at || "");
  });
}

export function PatternHowToTab() {
  const [notices, setNotices] = useState<PatternOperatorNotice[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pattern/notices?status=all", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { notices?: PatternOperatorNotice[] };
      setNotices(Array.isArray(data.notices) ? data.notices : []);
    } catch {
      // Keep last good list.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => mergeHowTos(notices), [notices]);

  async function acknowledge(id: string) {
    setActingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/notices/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to acknowledge.");
      setNotices((current) =>
        current.map((notice) =>
          notice.id === id
            ? {
                ...notice,
                status: "acknowledged",
                acknowledged_at: new Date().toISOString(),
              }
            : notice
        )
      );
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
          Pattern how-to
        </CardTitle>
        <p className="text-xs text-indigo-800/80">
          Every floor fix we explain stays here. Print A4 and keep the paper at the desk so you
          cannot get lost. New ones also land on Pattern email and at the top of every Pattern
          page (Queue, order board, library) until you tap Got it.
        </p>
        <div className="pt-2">
          <Link
            href="/pattern/how-to/print"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Printer className="h-4 w-4" />
            Print all how-tos
          </Link>
        </div>
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
              {PATTERN_HOWTO_NOTICES.some((howto) => howto.id === notice.id) ? (
                <Link
                  href={`/pattern/how-to/print?id=${encodeURIComponent(notice.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print this
                </Link>
              ) : null}
              {notice.href ? (
                <Link
                  href={notice.href}
                  target={notice.href.includes("/print") ? "_blank" : undefined}
                  rel={notice.href.includes("/print") ? "noopener noreferrer" : undefined}
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
