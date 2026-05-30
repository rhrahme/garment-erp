"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { PageHeader, DataTable, StatusBadge } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";

type LocalShipment = {
  id: string;
  awb_number: string;
  carrier: string;
  po_number: string | null;
  status: string;
  direction: "inbound" | "outbound";
  estimated_arrival: string | null;
  created_at: string;
  current_location?: string | null;
  latest_event?: string | null;
  latest_event_at?: string | null;
  tracking_url?: string | null;
  tracking_updated_at?: string | null;
};

export function ShipmentsWorkspace() {
  const [shipments, setShipments] = useState<LocalShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [track17Configured, setTrack17Configured] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shipmentsRes, syncRes] = await Promise.all([
        fetch("/api/shipments/local"),
        fetch("/api/shipments/sync"),
      ]);

      if (!shipmentsRes.ok) throw new Error("Failed to load shipments");
      const data = (await shipmentsRes.json()) as { shipments: LocalShipment[] };
      setShipments(data.shipments);

      if (syncRes.ok) {
        const syncData = await syncRes.json();
        setTrack17Configured(Boolean(syncData.configured));
      }
    } catch {
      setShipments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function syncTracking() {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/shipments/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to sync tracking");

      setMessage(
        `Updated ${data.updated ?? 0} shipment${data.updated === 1 ? "" : "s"}` +
          (data.registered ? ` (${data.registered} newly registered with 17TRACK)` : "") +
          "."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync tracking");
    } finally {
      setSyncing(false);
    }
  }

  const inbound = shipments.filter((s) => s.direction === "inbound");
  const outbound = shipments.filter((s) => s.direction === "outbound");

  return (
    <div>
      <PageHeader
        title="AWB Tracking"
        description={
          track17Configured
            ? "Live status and location via 17TRACK — Drapers shipments use DHL Express."
            : "Tracking numbers from supplier emails. Add TRACK17_API_KEY for live status and location."
        }
        action={
          <div className="flex flex-wrap gap-2">
            {track17Configured && (
              <Button onClick={() => void syncTracking()} disabled={syncing || shipments.length === 0}>
                <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : "Refresh tracking"}
              </Button>
            )}
            <Link href="/supplier-inbox">
              <Button variant="secondary">Scan supplier inbox</Button>
            </Link>
          </div>
        }
      />

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total Shipments</p>
          <p className="mt-1 text-2xl font-bold">{shipments.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Inbound (Fabric)</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{inbound.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Outbound (Finished)</p>
          <p className="mt-1 text-2xl font-bold text-violet-600">{outbound.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">In Transit</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {shipments.filter((s) => s.status === "in_transit" || s.status === "out_for_delivery").length}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading shipments…</p>
      ) : (
        <DataTable
          columns={[
            { key: "awb", label: "AWB Number" },
            { key: "carrier", label: "Carrier" },
            { key: "location", label: "Location" },
            { key: "latest", label: "Latest update" },
            { key: "po", label: "Fabric PO" },
            { key: "status", label: "Status" },
          ]}
          rows={shipments.map((s) => ({
            awb: s.tracking_url ? (
              <a
                href={s.tracking_url}
                target="_blank"
                rel="noreferrer"
                className="font-mono font-medium text-indigo-600 hover:text-indigo-700"
              >
                {s.awb_number}
              </a>
            ) : (
              <span className="font-mono font-medium">{s.awb_number}</span>
            ),
            carrier: s.carrier ?? "—",
            location: s.current_location ?? "—",
            latest: s.latest_event ? (
              <div className="max-w-xs">
                <p className="truncate text-sm text-slate-700">{s.latest_event}</p>
                {s.latest_event_at && (
                  <p className="text-xs text-slate-400">{formatDate(s.latest_event_at.slice(0, 10))}</p>
                )}
              </div>
            ) : (
              "—"
            ),
            po: s.po_number ? <span className="font-mono text-sm">{s.po_number}</span> : "—",
            status: <StatusBadge status={s.status} />,
          }))}
          emptyMessage="No tracking numbers yet — scan Supplier Inbox after suppliers reply with AWB numbers."
        />
      )}
    </div>
  );
}
