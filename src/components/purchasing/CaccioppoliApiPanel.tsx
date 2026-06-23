"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/Button";

type CaccioppoliStatus = {
  configured: boolean;
  connected: boolean;
  base_url: string;
  message: string;
  account?: string | null;
  usage?: {
    year: number;
    used_requests: number;
    annual_limit: number;
    remaining_requests: number;
  } | null;
  sample?: {
    ok: boolean;
    item?: string;
    stock_status?: string;
    info?: string;
  } | null;
};

type StockSyncResult = {
  scope: string;
  mode: string;
  checked: number;
  updated: number;
  in_stock: number;
  unavailable: number;
  not_found: number;
  errors: string[];
  synced_at: string;
  catalogs: string[];
};

type ImagesPreviewItem = {
  ok: boolean;
  item: string;
  error?: string;
  medias?: { square: string; zoom: string };
};

const PREVIEW_FABRICS = ["360102", "360101", "206107"];

export function CaccioppoliApiPanel() {
  const [status, setStatus] = useState<CaccioppoliStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [stockSyncResult, setStockSyncResult] = useState<StockSyncResult | null>(null);
  const [previewItems, setPreviewItems] = useState<ImagesPreviewItem[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFabric, setPreviewFabric] = useState("360102");
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/caccioppoli/status");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load Caccioppoli status");
      setStatus(data as CaccioppoliStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Caccioppoli status");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSwatchPreview = useCallback(async (codes: string[]) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(
        `/api/integrations/caccioppoli/images?codes=${encodeURIComponent(codes.join(","))}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load swatches");
      setPreviewItems((data.items ?? []) as ImagesPreviewItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load swatches");
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function runStockSync(scope: "open_orders" | "catalog") {
    setSyncing(true);
    setError(null);
    setStockSyncResult(null);
    try {
      const res = await fetch("/api/integrations/caccioppoli/sync-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Stock sync failed");
      setStockSyncResult(data as StockSyncResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stock sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Caccioppoli live stock API</h2>
          <p className="mt-1 text-sm text-slate-600">
            GR Sistemi API at api-service.grsis.it — syncs availability into jackets + shirting catalogs (replaces
            Esauriti PDF stock updates). Catalog prices still come from imported price lists.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void loadStatus()} disabled={loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Test connection
        </Button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Checking API…</p>
      ) : status ? (
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-start gap-2">
            {status.connected ? (
              <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" />
            )}
            <div>
              <p className={status.connected ? "font-medium text-emerald-800" : "font-medium text-indigo-900"}>
                {status.message}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {status.base_url}
                {status.account ? ` · ${status.account}` : null}
                {status.usage
                  ? ` · ${status.usage.remaining_requests.toLocaleString()} requests left (${status.usage.year})`
                  : null}
              </p>
            </div>
          </div>
          {status.sample && status.sample.ok ? (
            <p className="text-xs text-slate-600">
              Sample {status.sample.item}: {status.sample.stock_status} — {status.sample.info}
            </p>
          ) : null}
        </div>
      ) : null}

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      {status?.connected ? (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-medium text-slate-900">Fabric swatch preview</h3>
              <p className="mt-1 text-xs text-slate-500">
                From POST /caccioppoli/getItemImages — base64 JPEG returned by the API
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-slate-600">
                Lookup
                <input
                  type="text"
                  value={previewFabric}
                  onChange={(e) => setPreviewFabric(e.target.value)}
                  className="ml-2 w-24 rounded border border-slate-200 px-2 py-1 text-sm"
                  placeholder="360102"
                />
              </label>
              <Button
                size="sm"
                variant="secondary"
                disabled={previewLoading || !previewFabric.trim()}
                onClick={() => void loadSwatchPreview([previewFabric.trim()])}
              >
                {previewLoading ? "Loading…" : "Load one"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={previewLoading}
                onClick={() => void loadSwatchPreview(PREVIEW_FABRICS)}
              >
                Sample trio
              </Button>
            </div>
          </div>

          {previewLoading && !previewItems ? (
            <p className="mt-4 text-sm text-slate-500">Loading swatches…</p>
          ) : previewItems && previewItems.length > 0 ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {previewItems.map((item) =>
                item.ok && item.medias ? (
                  <div key={item.item} className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50/80">
                    <div className="relative aspect-square bg-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.medias.square}
                        alt={`Fabric ${item.item} swatch`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="p-3 text-xs">
                      <p className="font-semibold text-slate-900">{item.item}</p>
                    </div>
                  </div>
                ) : (
                  <div
                    key={item.item}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900"
                  >
                    {item.item}: {item.error ?? "No swatch"}
                  </div>
                )
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" disabled={syncing || !status?.connected} onClick={() => void runStockSync("open_orders")}>
          {syncing ? "Syncing…" : "Sync open order fabrics"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={syncing || !status?.connected}
          onClick={() => void runStockSync("catalog")}
        >
          Sync full SS26 catalogs
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Availability: POST /caccioppoli/cc_availability (single) or cc_availability_all (bulk). Swatches: POST
        /caccioppoli/getItemImages. No catalog or price endpoints — prices stay from PDF imports.
      </p>

      {stockSyncResult && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <p className="font-medium text-slate-900">
            Stock: updated {stockSyncResult.updated} lines ({stockSyncResult.mode})
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Checked {stockSyncResult.checked} · In stock: {stockSyncResult.in_stock} · Unavailable:{" "}
            {stockSyncResult.unavailable} · Not matched: {stockSyncResult.not_found}
            {stockSyncResult.catalogs?.length ? ` · ${stockSyncResult.catalogs.join(", ")}` : null}
          </p>
          {stockSyncResult.errors.length > 0 && (
            <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-indigo-800">
              {stockSyncResult.errors.slice(0, 8).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
