"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { PatternOperatorNotice } from "@/lib/types/pattern-operator-notices";

/** Amber highlight on every team page until that login taps Got it. */
export function TeamHowToBanner() {
  const pathname = usePathname();
  const [notices, setNotices] = useState<PatternOperatorNotice[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/team-notices", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { notices?: PatternOperatorNotice[] };
      setNotices(Array.isArray(data.notices) ? data.notices : []);
    } catch {
      /* keep last good list */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      setNotices((current) => current.filter((notice) => notice.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to acknowledge.");
    } finally {
      setActingId(null);
    }
  }

  if (pathname.startsWith("/how-to") || pathname.startsWith("/pattern/how-to")) return null;
  if (notices.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 shadow-sm print:hidden">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-950">
        <BookOpen className="h-4 w-4 text-amber-700" />
        New for every team - English + Bangla
      </p>
      <p className="mt-1 text-xs text-amber-900/80">
        Read this on the page. Tap Got it when you understand. After that it stays on{" "}
        <Link href="/how-to" className="font-medium text-amber-950 underline">
          How-to
        </Link>
        . Notun update - English ar Bangla. Got it er por How-to te thake.
      </p>
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
      <div className="mt-3 space-y-3">
        {notices.map((notice) => (
          <div key={notice.id} className="rounded-xl border border-amber-200 bg-white px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">{notice.title}</p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
              {notice.body}
            </pre>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {notice.href ? (
                <Link
                  href={notice.href}
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
        ))}
      </div>
    </div>
  );
}
