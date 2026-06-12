"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FileEdit } from "lucide-react";
import { DRAFT_KEYS } from "@/lib/autosave/draft-keys";
import { readLocalDraft } from "@/lib/autosave/local-draft-storage";
import {
  describeSalesOrderDraftSummary,
  isSalesOrderDraftEmpty,
  type SalesOrderDraftSummary,
  type SalesOrderFormDraft,
} from "@/lib/autosave/sales-order-draft";
import type { ClientProfile } from "@/lib/types/clients";

type DraftSource = "local" | "server";

function formatDraftHeadline(summary: SalesOrderDraftSummary): string {
  const primary = summary.clientEntries[0]?.label ?? "Unnamed client";
  const fabricWord = summary.totalFabrics === 1 ? "fabric" : "fabrics";

  if (summary.clientEntries.length <= 1) {
    return `${primary}, ${summary.totalFabrics} ${fabricWord}`;
  }

  const others = summary.clientEntries.length - 1;
  const otherWord = others === 1 ? "other client" : "other clients";
  return `${primary} + ${others} ${otherWord}, ${summary.totalFabrics} ${fabricWord}`;
}

function formatSavedAt(savedAt: string | null | undefined): string | null {
  if (!savedAt) return null;
  return new Date(savedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function FabricOrderDraftBanner() {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [serverSummary, setServerSummary] = useState<SalesOrderDraftSummary | null>(null);
  const [serverSavedAt, setServerSavedAt] = useState<string | null>(null);
  const [localSummary, setLocalSummary] = useState<SalesOrderDraftSummary | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [draftRes, clientsRes] = await Promise.all([
          fetch("/api/fabric-order-drafts"),
          fetch("/api/clients"),
        ]);

        if (cancelled) return;

        if (clientsRes.ok) {
          const clientsData = (await clientsRes.json()) as { clients?: ClientProfile[] };
          setClients(clientsData.clients ?? []);
        }

        if (draftRes.ok) {
          const data = (await draftRes.json()) as {
            summary?: SalesOrderDraftSummary | null;
            saved_at?: string | null;
          };
          setServerSummary(data.summary ?? null);
          setServerSavedAt(data.saved_at ?? null);
        }
      } catch {
        // Non-fatal — banner simply stays hidden.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const stored = readLocalDraft<SalesOrderFormDraft>(DRAFT_KEYS.fabricOrderNew);
    if (!stored || isSalesOrderDraftEmpty(stored)) {
      setLocalSummary(null);
      return;
    }
    setLocalSummary(describeSalesOrderDraftSummary(stored, clients));
  }, [clients, hydrated]);

  const activeDraft = useMemo(() => {
    if (localSummary) {
      return { source: "local" as DraftSource, summary: localSummary, savedAt: localSummary.savedAt };
    }
    if (serverSummary) {
      return { source: "server" as DraftSource, summary: serverSummary, savedAt: serverSavedAt };
    }
    return null;
  }, [localSummary, serverSavedAt, serverSummary]);

  if (!hydrated || !activeDraft) return null;

  const savedLabel = formatSavedAt(activeDraft.savedAt);
  const sourceLabel =
    activeDraft.source === "local"
      ? "Saved on this browser"
      : "Saved on the server (works on any device)";

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-amber-100 p-2 text-amber-800">
            <FileEdit className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-amber-950">
              Unfinished order: {formatDraftHeadline(activeDraft.summary)}
            </p>
            <p className="mt-1 text-sm text-amber-900/80">
              {sourceLabel}
              {savedLabel ? ` · Last edited ${savedLabel}` : null}
            </p>
            {localSummary && serverSummary ? (
              <p className="mt-1 text-xs text-amber-800/80">
                Also found a server copy — continuing will prefer this browser draft.
              </p>
            ) : null}
          </div>
        </div>

        <Link
          href="/fabric-orders/new?continue=1"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-800"
        >
          Continue editing
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
