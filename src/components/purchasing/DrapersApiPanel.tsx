"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/Button";

type DrapersStatus = {
  configured: boolean;
  connected: boolean;
  base_url: string;
  message: string;
  account?: string | null;
  capabilities?: Record<string, boolean> | null;
  key_expires?: string | null;
  current_rate?: number;
  sample?: {
    ok: boolean;
    fabric_code?: string;
    stock_status?: string;
    quantity_meters?: number;
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
};

type PriceSyncResult = {
  checked: number;
  updated: number;
  unchanged: number;
  not_in_catalog: number;
  synced_at: string;
};

type MediasPreviewItem = {
  ok: boolean;
  fabric_code: string;
  error?: string;
  medias?: { square: string; zoom: string; ruler: string };
  detail?: {
    fabric_code: string;
    brand: string;
    bunch: string;
    fibres: string;
    is_available: boolean;
  };
};

const PREVIEW_FABRICS = ["10101", "90640", "85119"];

export function DrapersApiPanel() {
  const [status, setStatus] = useState<DrapersStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [stockSyncResult, setStockSyncResult] = useState<StockSyncResult | null>(null);
  const [priceSyncResult, setPriceSyncResult] = useState<PriceSyncResult | null>(null);
  const [previewItems, setPreviewItems] = useState<MediasPreviewItem[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFabric, setPreviewFabric] = useState("90640");
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/drapers/status");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load Drapers status");
      setStatus(data as DrapersStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Drapers status");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSwatchPreview = useCallback(async (codes: string[]) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(
        `/api/integrations/drapers/medias?codes=${encodeURIComponent(codes.join(","))}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load swatch preview");
      setPreviewItems((data.items ?? []) as MediasPreviewItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load swatch preview");
      setPreviewItems(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!status?.connected || !status.capabilities?.collection_media) return;
    void loadSwatchPreview(PREVIEW_FABRICS);
  }, [status?.connected, status?.capabilities?.collection_media, loadSwatchPreview]);

  async function runStockSync(scope: "open_orders" | "catalog") {
    setSyncing(true);
    setError(null);
    setStockSyncResult(null);
    try {
      const res = await fetch("/api/integrations/drapers/sync-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Stock sync failed");
      setStockSyncResult(data as StockSyncResult);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stock sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function runPriceSync() {
    setSyncing(true);
    setError(null);
    setPriceSyncResult(null);
    try {
      const res = await fetch("/api/integrations/drapers/sync-prices", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Price sync failed");
      setPriceSyncResult(data as PriceSyncResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Price sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const caps = status?.capabilities;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Drapers live stock API</h2>
          <p className="mt-1 text-sm text-slate-600">
            Official API at api.drapersitaly.it — syncs live stock into the Drapers catalog (replaces PDF stock
            updates).
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
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            )}
            <div>
              <p className={status.connected ? "font-medium text-emerald-800" : "font-medium text-amber-900"}>
                {status.message}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {status.base_url}
                {status.account ? ` · ${status.account}` : null}
                {status.key_expires ? ` · key expires ${status.key_expires}` : null}
              </p>
            </div>
          </div>
          {caps && (
            <p className="text-xs text-slate-600">
              Permissions:{" "}
              {[
                caps.stock && "stock",
                caps.collection && "catalog",
                caps.collection_media && "swatch images",
                caps.pricelist && "prices",
                caps.carts && "carts",
                caps.orders && "orders",
              ]
                .filter(Boolean)
                .join(", ") || "none"}
            </p>
          )}
          {status.sample && status.sample.ok ? (
            <p className="text-xs text-slate-600">
              Sample {status.sample.fabric_code}: {status.sample.stock_status}
              {status.sample.quantity_meters != null ? ` · ${status.sample.quantity_meters} m` : null}
            </p>
          ) : null}
        </div>
      ) : null}

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      {status?.connected && caps?.collection_media ? (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-medium text-slate-900">Fabric swatch preview</h3>
              <p className="mt-1 text-xs text-slate-500">
                From GET /fabrics/&#123;code&#125;/medias/ — square (thumbnail), zoom, ruler
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
                  placeholder="90640"
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
                  <div
                    key={item.fabric_code}
                    className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50/80"
                  >
                    <div className="relative aspect-square bg-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.medias.square}
                        alt={`Fabric ${item.fabric_code} swatch`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="space-y-2 p-3 text-xs">
                      <p className="font-semibold text-slate-900">{item.fabric_code}</p>
                      {item.detail ? (
                        <p className="text-slate-600">
                          {item.detail.bunch}
                          <br />
                          {item.detail.brand} · {item.detail.fibres}
                        </p>
                      ) : null}
                      <div className="flex gap-2">
                        <a
                          href={item.medias.zoom}
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber-800 underline"
                        >
                          Zoom
                        </a>
                        <a
                          href={item.medias.ruler}
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber-800 underline"
                        >
                          Ruler
                        </a>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    key={item.fabric_code}
                    className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
                  >
                    {item.fabric_code}: {item.error ?? "No swatch"}
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
          Sync full stock catalog
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={syncing || !status?.connected || !caps?.pricelist}
          onClick={() => void runPriceSync()}
        >
          Sync account prices
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Stock: GET /stock/. Swatches: GET /fabrics/&#123;code&#125;/medias/. Prices: GET /pricelist/account/.
      </p>

      {stockSyncResult && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <p className="font-medium text-slate-900">
            Stock: updated {stockSyncResult.updated} lines ({stockSyncResult.mode})
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Checked {stockSyncResult.checked} · In stock: {stockSyncResult.in_stock} · Unavailable:{" "}
            {stockSyncResult.unavailable} · Not in local catalog: {stockSyncResult.not_found}
          </p>
          {stockSyncResult.errors.length > 0 && (
            <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-amber-800">
              {stockSyncResult.errors.slice(0, 8).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {priceSyncResult && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <p className="font-medium text-slate-900">
            Prices: updated {priceSyncResult.updated} · unchanged {priceSyncResult.unchanged}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Checked {priceSyncResult.checked} from API · Not in local catalog: {priceSyncResult.not_in_catalog}
          </p>
        </div>
      )}
    </div>
  );
}
