"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { PatternOperatorNotice } from "@/lib/types/pattern-operator-notices";

export function PatternOperatorNoticesPanel() {
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

  if (notices.length === 0) return null;

  return (
    <Card className="mb-4 border-indigo-200 bg-indigo-50/50 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-indigo-950">
          <BookOpen className="h-4 w-4 text-indigo-600" />
          For Pattern - how-to
        </CardTitle>
        <p className="text-xs text-indigo-800/80">
          Read these steps, then tap Got it when you understand. They also go to your Pattern email.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {notices.map((notice) => (
          <div
            key={notice.id}
            className="rounded-xl border border-indigo-200 bg-white px-4 py-3 shadow-sm"
          >
            <p className="text-sm font-semibold text-slate-900">{notice.title}</p>
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
        ))}
      </CardContent>
    </Card>
  );
}
