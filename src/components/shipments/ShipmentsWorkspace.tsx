"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { AddAwbForm, type PendingAwbOption } from "@/components/shipments/AddAwbForm";
import { AwbScanInput } from "@/components/shipments/AwbScanInput";
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
  const searchParams = useSearchParams();
  const defaultPoId = searchParams.get("po_id");

  const [shipments, setShipments] = useState<LocalShipment[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingAwbOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [track17Configured, setTrack17Configured] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedAwb, setHighlightedAwb] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shipmentsRes, syncRes, pendingRes] = await Promise.all([
        fetch("/api/shipments/local"),
        fetch("/api/shipments/sync"),
        fetch("/api/shipments/pending"),
      ]);

      if (!shipmentsRes.ok) throw new Error("Failed to load shipments");
      const data = (await shipmentsRes.json()) as { shipments: LocalShipment[] };
      setShipments(data.shipments);

      if (syncRes.ok) {
        const syncData = await syncRes.json();
        setTrack17Configured(Boolean(syncData.configured));
      }

      if (pendingRes.ok) {
        const pendingData = (await pendingRes.json()) as { pending: PendingAwbOption[] };
        setPendingOrders(pendingData.pending ?? []);
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
            : "Tracking numbers from supplier emails or manual entry. Add TRACK17_API_KEY for live status."
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
              <Button variant="secondary">Scan email inbox</Button>
            </Link>
          </div>
        }
      />

      <AwbScanInput
        onFound={(awbNumber) => setHighlightedAwb(awbNumber.toUpperCase())}
        onRefresh={load}
      />

      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <p className="font-medium text-slate-900">How AWB tracking works</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Scan the carrier label above to look up a shipment, or after suppliers email an AWB use{" "}
            <Link href="/supplier-inbox" className="font-medium text-indigo-600 hover:text-indigo-700">
              Scan email inbox
            </Link>{" "}
            to auto-parse AWBs from email. You can also add them manually below.
          </li>
          <li>
            Each AWB links to its fabric PO. With <span className="font-mono text-xs">TRACK17_API_KEY</span> set,
            click Refresh tracking for live DHL/carrier status.
          </li>
          <li>
            Sent POs still waiting for an AWB appear in{" "}
            <span className="font-medium">Awaiting AWB</span> below and on the dashboard.
          </li>
        </ol>
      </div>

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

      {pendingOrders.length > 0 && (
        <div className="mb-6 space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="font-medium text-amber-950">
              Awaiting AWB — {pendingOrders.length} sent fabric PO{pendingOrders.length === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-sm text-amber-900">
              These POs were emailed to suppliers but have no tracking number yet.
            </p>
          </div>
          <AddAwbForm
            pendingOrders={pendingOrders}
            defaultPoId={defaultPoId}
            onAdded={() => void load()}
          />
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Fabric PO</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Supplier</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Client</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingOrders.map((po) => (
                  <tr key={po.id}>
                    <td className="px-4 py-3 font-mono font-medium">{po.po_number}</td>
                    <td className="px-4 py-3">{po.supplier_name ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-indigo-700">{po.client_reference ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {po.emailed_at ? formatDate(po.emailed_at.slice(0, 10)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          <p className="text-sm text-slate-500">Awaiting AWB</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{pendingOrders.length}</p>
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
          rows={shipments.map((s) => {
            const isHighlighted =
              highlightedAwb !== null && s.awb_number.toUpperCase() === highlightedAwb;
            const rowClassName = isHighlighted ? "bg-emerald-50 ring-1 ring-inset ring-emerald-300" : undefined;

            return {
              rowClassName,
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
            };
          })}
          emptyMessage="No tracking numbers yet — scan an AWB label above, scan email inbox after suppliers reply, or add an AWB manually."
        />
      )}
    </div>
  );
}
