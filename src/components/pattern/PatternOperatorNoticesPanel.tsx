"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ExternalLink, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_NOTICE_ID,
  PATTERN_HOWTO_NOTICES,
} from "@/lib/pattern/pattern-operator-notice-copy";
import type { PatternOperatorNotice } from "@/lib/types/pattern-operator-notices";

function sortOpenNotices(notices: PatternOperatorNotice[]): PatternOperatorNotice[] {
  const rank = new Map(PATTERN_HOWTO_NOTICES.map((howto, index) => [howto.id, index]));
  return [...notices].sort((a, b) => {
    const aRank = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bRank = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return (b.created_at || "").localeCompare(a.created_at || "");
  });
}

export function PatternOperatorNoticesPanel() {
  const pathname = usePathname();
  const [notices, setNotices] = useState<PatternOperatorNotice[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pattern/notices", { cache: "no-store" });
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

  const rows = useMemo(() => sortOpenNotices(notices), [notices]);

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
      setNotices((current) => current.filter((notice) => notice.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to acknowledge.");
    } finally {
      setActingId(null);
    }
  }

  if (pathname.startsWith("/pattern/how-to")) return null;
  if (rows.length === 0) return null;

  return (
    <Card className="mb-4 border-amber-300 bg-amber-50 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-amber-950">
          <BookOpen className="h-4 w-4 text-amber-700" />
          Read this on the page - do not wait for the owner
        </CardTitle>
        <p className="text-xs text-amber-900/80">
          Follow the steps here, then tap Got it. Print A4 and keep the paper at the desk. After
          that it stays on the{" "}
          <Link href="/pattern/how-to" className="font-medium text-amber-950 underline">
            How-to
          </Link>{" "}
          tab.
        </p>
        <div className="pt-2">
          <Link
            href="/pattern/how-to/print"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-900"
          >
            <Printer className="h-4 w-4" />
            Print all how-tos
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {rows.map((notice) => {
          const featured = notice.id === ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_NOTICE_ID;
          return (
            <div
              key={notice.id}
              className={
                featured
                  ? "rounded-xl border-2 border-amber-400 bg-white px-4 py-3 shadow-sm"
                  : "rounded-xl border border-amber-200 bg-white px-4 py-3 shadow-sm"
              }
            >
              <p className="text-sm font-semibold text-slate-900">{notice.title}</p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
                {notice.body}
              </pre>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {PATTERN_HOWTO_NOTICES.some((howto) => howto.id === notice.id) ? (
                  <Link
                    href={`/pattern/how-to/print?id=${encodeURIComponent(notice.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-amber-900 hover:underline"
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
                    className="inline-flex items-center gap-1 text-sm font-medium text-amber-900 hover:underline"
                  >
                    {notice.href_label ?? "Open"}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
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
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
