"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, Tag } from "lucide-react";
import Link from "next/link";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { looksLikeFabricLabelInput } from "@/lib/sales-orders/label-codes";
import type { FabricLabelLookupResult } from "@/lib/production/fabric-label-lookup";
import { cn } from "@/lib/utils";

type FabricLabelLookupProps = {
  onReceiveLine?: (salesOrderLineId: string) => void | Promise<void>;
  actingId?: string | null;
  /** Bump after receive / list refresh so lookup status stays in sync. */
  reloadKey?: number;
};

function formatArticle(articleNumber: number): string {
  return `L${String(articleNumber).padStart(2, "0")}`;
}

function statusLabel(status: FabricLabelLookupResult["receive_status"]): string {
  switch (status) {
    case "pending":
      return "Not received yet";
    case "received":
      return "Received — awaiting prep";
    case "fabric_prep":
      return "In wash / soak / iron";
    case "handed_off":
      return "Handed to production";
    default:
      return status;
  }
}

function statusClass(status: FabricLabelLookupResult["receive_status"]): string {
  switch (status) {
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "received":
      return "border-pink-200 bg-pink-50 text-pink-950";
    case "fabric_prep":
      return "border-sky-200 bg-sky-50 text-sky-950";
    case "handed_off":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export function FabricLabelLookup({
  onReceiveLine,
  actingId = null,
  reloadKey = 0,
}: FabricLabelLookupProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 350);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FabricLabelLookupResult | null>(null);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const runLookup = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      setResult(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fabric-receiving/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      setResult(data.lookup as FabricLabelLookupResult);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const submitLookup = useCallback(() => {
    void runLookup(query);
  }, [query, runLookup]);

  useEffect(() => {
    if (!looksLikeFabricLabelInput(debouncedQuery)) return;
    void runLookup(debouncedQuery);
  }, [debouncedQuery, runLookup]);

  useEffect(() => {
    if (!query.trim() || !result) return;
    void runLookup(query);
  }, [reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps -- refresh status after receive

  const looksLikeLabel = looksLikeFabricLabelInput(query);

  return (
    <section className="rounded-xl border-2 border-teal-300 bg-teal-50/40 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-teal-600 p-2.5 text-white">
          <Tag className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-slate-900">Receive fabric — paste sticker code</h3>
          <p className="mt-1 text-sm text-slate-600">
            Paste or type the unique code from the supplier sticker. No employee badge needed. Formats like{" "}
            <code className="rounded bg-white px-1 font-mono text-xs">FR-0226-0024/ 0109-L32</code> and full QR codes
            both work.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <div className="relative min-w-[16rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value.toUpperCase());
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitLookup();
                  }
                }}
                placeholder="FR-0226-0024/ 0109-L32"
                className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 font-mono text-sm uppercase"
                autoComplete="off"
                spellCheck={false}
                aria-label="Paste fabric label code"
              />
            </div>
            <button
              type="button"
              onClick={submitLookup}
              disabled={loading || !query.trim()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Look up
            </button>
          </div>

          {looksLikeLabel && loading && (
            <p className="mt-2 text-xs text-teal-800">Looking up label…</p>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-900" role="alert">
              {error}
            </div>
          )}

          {result && (
            <div className={cn("mt-3 rounded-lg border-2 px-4 py-3 text-sm", statusClass(result.receive_status))}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{statusLabel(result.receive_status)}</p>
              <p className="mt-1 text-base font-semibold text-slate-900">
                Art. {formatArticle(result.article_number)}{" "}
                <code className="font-mono text-teal-900">{result.fabric_cut_code}</code>
              </p>
              <p className="mt-1 font-medium">
                {result.client_name} · {result.so_number}
              </p>
              <p className="mt-1">
                {result.garment_type}
                {result.piece_name && result.piece_name !== result.garment_type ? ` — ${result.piece_name}` : ""} ·{" "}
                {result.supplier_name} {result.fabric_number}
              </p>
              {(result.composition || result.weight_gsm) && (
                <p className="mt-1 text-xs opacity-90">
                  {[result.composition, result.weight_gsm ? `${result.weight_gsm} gsm` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {result.receive_status === "pending" && onReceiveLine && (
                  <button
                    type="button"
                    onClick={() => void onReceiveLine(result.sales_order_line_id)}
                    disabled={actingId === result.sales_order_line_id}
                    className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {actingId === result.sales_order_line_id ? "Receiving…" : "Mark received"}
                  </button>
                )}
                <Link
                  href={`/orders/${result.sales_order_id}`}
                  className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-teal-800 ring-1 ring-teal-200 hover:bg-teal-50"
                >
                  Open order
                </Link>
              </div>

              {result.receive_status === "pending" && (
                <p className="mt-2 text-xs">
                  Or scan your badge (step 1), then scan this label at <strong>Receive</strong> (step 2).
                </p>
              )}
              {result.receive_status === "received" && (
                <p className="mt-2 text-xs">
                  Fabric is on the work list. Scan at <strong>Wash</strong>, <strong>Soak</strong>, or{" "}
                  <strong>Iron</strong> to start prep.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
