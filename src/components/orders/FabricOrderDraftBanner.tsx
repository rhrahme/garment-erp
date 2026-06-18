"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, FileEdit } from "lucide-react";
import {
  buildFabricOrderContinueOptions,
  countDraftFabricLines,
  describeSalesOrderDraftSummary,
  isSalesOrderDraftEmpty,
  migrateSalesOrderDraft,
  readFabricOrderLocalDraft,
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

function formatContinueOptionsHeadline(
  options: Array<{ label: string; fabricCount: number }>
): string {
  if (options.length <= 1) {
    const only = options[0];
    if (!only) return "Unfinished order";
    const fabricWord = only.fabricCount === 1 ? "fabric" : "fabrics";
    return `${only.label}, ${only.fabricCount} ${fabricWord}`;
  }

  const totalFabrics = options.reduce((sum, option) => sum + option.fabricCount, 0);
  const fabricWord = totalFabrics === 1 ? "fabric" : "fabrics";
  const orderWord = options.length === 1 ? "order" : "orders";
  return `${options.length} unfinished ${orderWord}, ${totalFabrics} ${fabricWord}`;
}

function formatSavedAt(savedAt: string | null | undefined): string | null {
  if (!savedAt) return null;
  return new Date(savedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function FabricOrderDraftBanner({
  initialServerSummary = null,
  initialServerSavedAt = null,
}: {
  /** Server-rendered draft summary — shown immediately before client fetch completes. */
  initialServerSummary?: SalesOrderDraftSummary | null;
  initialServerSavedAt?: string | null;
}) {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [serverSummary, setServerSummary] = useState<SalesOrderDraftSummary | null>(initialServerSummary);
  const [serverSavedAt, setServerSavedAt] = useState<string | null>(initialServerSavedAt);
  const [serverDraft, setServerDraft] = useState<SalesOrderFormDraft | null>(null);
  const [localSummary, setLocalSummary] = useState<SalesOrderDraftSummary | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const healAttemptedRef = useRef(false);

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
            draft?: SalesOrderFormDraft | null;
            summary?: SalesOrderDraftSummary | null;
            saved_at?: string | null;
          };
          setServerSummary(data.summary ?? null);
          setServerSavedAt(data.saved_at ?? null);
          setServerDraft(data.draft ? migrateSalesOrderDraft(data.draft) : null);
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
    const stored = readFabricOrderLocalDraft();
    if (!stored || isSalesOrderDraftEmpty(stored)) {
      setLocalSummary(null);
      return;
    }
    setLocalSummary(describeSalesOrderDraftSummary(stored, clients));
  }, [clients, hydrated]);

  /** Push a richer browser draft to the server so other devices can see it. */
  useEffect(() => {
    if (!hydrated) return;

    const migrated = readFabricOrderLocalDraft();
    if (!migrated || isSalesOrderDraftEmpty(migrated)) return;

    const localLines = countDraftFabricLines(migrated);
    if (localLines === 0) return;

    const serverLines = serverSummary?.totalFabrics ?? 0;
    if (localLines <= serverLines) {
      healAttemptedRef.current = false;
      return;
    }

    if (healAttemptedRef.current) return;
    healAttemptedRef.current = true;

    void (async () => {
      try {
        const res = await fetch("/api/fabric-order-drafts", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(migrated),
        });
        if (!res.ok) {
          healAttemptedRef.current = false;
          return;
        }
        const data = (await res.json()) as { saved_at?: string };
        const healed = describeSalesOrderDraftSummary(migrated, clients);
        if (healed) {
          setServerSummary(healed);
          setServerSavedAt(data.saved_at ?? healed.savedAt);
        }

        const verifyRes = await fetch("/api/fabric-order-drafts");
        if (verifyRes.ok) {
          const verifyData = (await verifyRes.json()) as {
            summary?: SalesOrderDraftSummary | null;
          };
          const verifiedLines = verifyData.summary?.totalFabrics ?? 0;
          if (verifiedLines < localLines) {
            healAttemptedRef.current = false;
          }
        }
      } catch {
        healAttemptedRef.current = false;
      }
    })();
  }, [clients, hydrated, serverSummary]);

  const activeDraft = useMemo(() => {
    const localTime = localSummary?.savedAt ? Date.parse(localSummary.savedAt) : 0;
    const serverTime = serverSavedAt ? Date.parse(serverSavedAt) : 0;
    const localLines = localSummary?.totalFabrics ?? 0;
    const serverLines = serverSummary?.totalFabrics ?? 0;
    const preferLocal = localLines > 0 && (localLines > serverLines || localTime >= serverTime);

    const continueOptions = buildFabricOrderContinueOptions(
      clients,
      preferLocal ? null : serverDraft
    );
    if (continueOptions.length === 0) return null;

    const summary = preferLocal ? localSummary : serverSummary ?? localSummary;
    if (!summary) return null;

    const savedAt = preferLocal ? localSummary?.savedAt ?? null : serverSavedAt ?? localSummary?.savedAt ?? null;
    const source: DraftSource = preferLocal ? "local" : "server";

    return { source, summary, savedAt, continueOptions };
  }, [clients, localSummary, serverDraft, serverSavedAt, serverSummary]);

  if (!hydrated || !activeDraft) return null;

  const savedLabel = formatSavedAt(activeDraft.savedAt);
  const sourceLabel =
    activeDraft.source === "local"
      ? "Saved on this browser"
      : "Saved on the server (works on any device)";
  const headline =
    activeDraft.continueOptions.length > 1
      ? formatContinueOptionsHeadline(activeDraft.continueOptions)
      : formatDraftHeadline(activeDraft.summary);
  const continueHint =
    activeDraft.continueOptions.length > 1
      ? "Choose which draft to continue when you click below."
      : null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-amber-100 p-2 text-amber-800">
            <FileEdit className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-amber-950">Unfinished order: {headline}</p>
            <p className="mt-1 text-sm text-amber-900/80">
              {sourceLabel}
              {savedLabel ? ` · Last edited ${savedLabel}` : null}
            </p>
            {continueHint ? (
              <p className="mt-1 text-xs text-amber-800/80">{continueHint}</p>
            ) : null}
            <p className="mt-1 text-xs text-amber-800/80">
              Use <span className="font-medium">New fabric order</span> above to start one for a different client.
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
