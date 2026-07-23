"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FactoryBrandTabs } from "@/components/brands/FactoryBrandTabs";
import { Button } from "@/components/ui/Button";
import { getFactoryBrands } from "@/lib/data/factory-brands";
import { filterSalesClientsByBrand } from "@/lib/sales/access";
import type { ClientProfile } from "@/lib/types/clients";
import type { CustomerInvoice } from "@/lib/types/customer-invoices";
import type { SalesOrder } from "@/lib/types/sales-orders";
import type {
  SalesClientDetails,
  SalesFitting,
  SalesFittingStatus,
  SalesMilestone,
} from "@/lib/types/sales-workspace";

const factoryBrands = getFactoryBrands();

type Tab = "clients" | "fabrics" | "orders" | "fittings" | "production";
type MilestoneRow = {
  sales_order_id: string;
  so_number: string;
  client_name: string;
  milestone: SalesMilestone;
  needs_attention: boolean;
};
type Workspace = {
  clients: ClientProfile[];
  orders: SalesOrder[];
  invoices: CustomerInvoice[];
  client_details: SalesClientDetails[];
  fittings: SalesFitting[];
  milestones: MilestoneRow[];
  allowed_brand_ids?: string[] | null;
};

const TABS: { id: Tab; label: string }[] = [
  { id: "clients", label: "Clients" },
  { id: "fabrics", label: "Fabrics" },
  { id: "orders", label: "Orders / Invoices" },
  { id: "fittings", label: "Fittings" },
  { id: "production", label: "Production status" },
];
const MEASUREMENT_FIELDS = [
  "Chest",
  "Waist",
  "Hip",
  "Shoulder",
  "Sleeve",
  "Jacket length",
  "Trouser waist",
  "Inseam",
];
const MILESTONES: SalesMilestone[] = [
  "fabric_requested",
  "fabric_ordered",
  "fabric_received",
  "in_production",
  "finishing",
  "ironing",
  "ready_for_fitting",
  "ready_for_delivery",
  "delivered",
];

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function SalesWorkspaceDashboard() {
  const [tab, setTab] = useState<Tab>("clients");
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [clientId, setClientId] = useState("");
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [fittingOrderId, setFittingOrderId] = useState("");
  const [fittingDate, setFittingDate] = useState("");
  const [fittingNotes, setFittingNotes] = useState("");
  /** null = all brands; factory brand id; or UNASSIGNED_FACTORY_BRAND_ID */
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const allowedBrandIds = data?.allowed_brand_ids ?? null;
  const isBrandScoped = Boolean(allowedBrandIds && allowedBrandIds.length > 0);
  const scopedBrands = useMemo(() => {
    if (!allowedBrandIds) return factoryBrands;
    const allowed = new Set(allowedBrandIds);
    return factoryBrands.filter((brand) => allowed.has(brand.id));
  }, [allowedBrandIds]);

  async function load() {
    try {
      const response = await fetch("/api/sales/workspace", { cache: "no-store" });
      const body = (await response.json()) as Workspace & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Failed to load sales workspace.");
      setData(body);
      setClientId((current) => current || body.clients[0]?.id || "");
      setFittingOrderId((current) => current || body.orders[0]?.id || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load workspace.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!isBrandScoped || !allowedBrandIds?.length) return;
    if (allowedBrandIds.length === 1) {
      setBrandFilter(allowedBrandIds[0]!);
      return;
    }
    if (brandFilter && !allowedBrandIds.includes(brandFilter)) {
      setBrandFilter(allowedBrandIds[0]!);
    }
  }, [allowedBrandIds, brandFilter, isBrandScoped]);

  // Server already scopes clients; apply UI brand tab filter on top.
  const filteredClients = useMemo(
    () => filterSalesClientsByBrand(data?.clients ?? [], brandFilter, allowedBrandIds),
    [allowedBrandIds, brandFilter, data?.clients]
  );

  useEffect(() => {
    if (filteredClients.length === 0) {
      setClientId("");
      return;
    }
    if (!filteredClients.some((client) => client.id === clientId)) {
      setClientId(filteredClients[0]!.id);
    }
  }, [clientId, filteredClients]);

  const selectedDetails = useMemo(
    () => data?.client_details.find((item) => item.client_id === clientId),
    [clientId, data]
  );

  useEffect(() => {
    setMeasurements(selectedDetails?.measurements ?? {});
  }, [selectedDetails]);

  async function saveMeasurements() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/sales/client-details", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, measurements }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Failed to save measurements.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file: File) {
    setSaving(true);
    setError(null);
    const form = new FormData();
    form.set("client_id", clientId);
    form.set("photo", file);
    try {
      const response = await fetch("/api/sales/client-photos", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Failed to upload photo.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to upload photo.");
    } finally {
      setSaving(false);
    }
  }

  async function createFitting() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/sales/fittings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sales_order_id: fittingOrderId,
          scheduled_at: fittingDate,
          notes: fittingNotes,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Failed to schedule fitting.");
      setFittingDate("");
      setFittingNotes("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to schedule fitting.");
    } finally {
      setSaving(false);
    }
  }

  async function updateFitting(fittingId: string, status: SalesFittingStatus) {
    await fetch("/api/sales/fittings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fitting_id: fittingId, status }),
    });
    await load();
  }

  async function updateMilestone(orderId: string, milestone: SalesMilestone, acknowledge = false) {
    await fetch("/api/sales/milestones", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sales_order_id: orderId, milestone, acknowledge }),
    });
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`min-h-12 rounded-xl px-3 py-3 text-sm font-semibold ${
              tab === item.id ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>}
      {!data && !error && <p className="text-slate-500">Loading sales workspace…</p>}

      {data && tab === "clients" && (
        <section className="space-y-5">
          <div className="space-y-4 rounded-xl border bg-white p-4">
            <FactoryBrandTabs
              value={brandFilter}
              onChange={setBrandFilter}
              showAll={!isBrandScoped}
              showUnassigned={!isBrandScoped}
              allLabel="All brands"
              unassignedLabel="Unassigned"
              label="Filter by brand"
              brands={scopedBrands}
            />
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                className="min-h-12 min-w-64 flex-1 rounded-lg border border-slate-300 px-3"
                disabled={filteredClients.length === 0}
              >
                {filteredClients.length === 0 ? (
                  <option value="">No clients for this brand</option>
                ) : (
                  filteredClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.first_name} {client.last_name} · {client.code}
                    </option>
                  ))
                )}
              </select>
              <Link href="/clients"><Button>New / edit client profile</Button></Link>
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-5">
              <h2 className="text-lg font-semibold">Measurements</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {MEASUREMENT_FIELDS.map((field) => (
                  <label key={field} className="text-sm font-medium text-slate-700">
                    {field}
                    <input
                      value={measurements[field] ?? ""}
                      onChange={(event) =>
                        setMeasurements((current) => ({ ...current, [field]: event.target.value }))
                      }
                      placeholder="e.g. 102 cm"
                      className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3"
                    />
                  </label>
                ))}
              </div>
              <Button className="mt-4" onClick={() => void saveMeasurements()} disabled={!clientId || saving}>
                Save measurements
              </Button>
            </div>
            <div className="rounded-xl border bg-white p-5">
              <h2 className="text-lg font-semibold">Client photos</h2>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="mt-4 block w-full text-sm"
                disabled={!clientId || saving}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadPhoto(file);
                }}
              />
              <div className="mt-4 grid grid-cols-3 gap-3">
                {(selectedDetails?.photos ?? []).map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={photo.id}
                    src={`/api/sales/client-photos/${photo.id}`}
                    alt={photo.filename}
                    className="aspect-square w-full rounded-lg border object-cover"
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {data && tab === "fabrics" && (
        <section className="grid gap-4 md:grid-cols-2">
          <Link href="/fabric-specification" className="rounded-xl border bg-white p-6 hover:border-indigo-400">
            <h2 className="text-xl font-semibold">Browse fabric catalog</h2>
            <p className="mt-2 text-slate-600">Search supplier, color, composition, weight, and fabric number. Purchase prices are removed.</p>
          </Link>
          <Link href="/orders/new" className="rounded-xl border bg-white p-6 hover:border-indigo-400">
            <h2 className="text-xl font-semibold">Record selection / request fabric</h2>
            <p className="mt-2 text-slate-600">Create an order, pick the client and fabric, enter meters, then submit the fabric request to Admin.</p>
          </Link>
        </section>
      )}

      {data && tab === "orders" && (
        <section className="space-y-3">
          <div className="flex justify-end"><Link href="/orders/new"><Button>+ New sales order</Button></Link></div>
          {data.orders.map((order) => {
            const invoice = data.invoices.find((item) => item.sales_order_id === order.id);
            return (
              <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
                <div>
                  <Link href={`/orders/${order.id}`} className="font-semibold text-indigo-700">{order.so_number}</Link>
                  <p className="text-sm text-slate-600">{order.client_name} · {order.fabric_lines.length} fabric line(s)</p>
                </div>
                {invoice ? (
                  <Link href={`/invoices/${invoice.id}`}><Button variant="secondary">{invoice.invoice_number} · {label(invoice.status)}</Button></Link>
                ) : (
                  <span className="text-sm text-slate-500">Open order to create invoice</span>
                )}
              </div>
            );
          })}
        </section>
      )}

      {data && tab === "fittings" && (
        <section className="space-y-5">
          <div className="grid gap-3 rounded-xl border bg-white p-5 md:grid-cols-4">
            <select value={fittingOrderId} onChange={(event) => setFittingOrderId(event.target.value)} className="min-h-12 rounded-lg border px-3">
              {data.orders.map((order) => <option key={order.id} value={order.id}>{order.so_number} · {order.client_name}</option>)}
            </select>
            <input type="datetime-local" value={fittingDate} onChange={(event) => setFittingDate(event.target.value)} className="min-h-12 rounded-lg border px-3" />
            <input value={fittingNotes} onChange={(event) => setFittingNotes(event.target.value)} placeholder="Fitting notes" className="min-h-12 rounded-lg border px-3" />
            <Button onClick={() => void createFitting()} disabled={!fittingDate || saving}>Schedule fitting</Button>
          </div>
          {data.fittings.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).map((fitting) => {
            const order = data.orders.find((item) => item.id === fitting.sales_order_id);
            return (
              <div key={fitting.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
                <div>
                  <p className="font-semibold">Fitting {fitting.sequence_number} · {order?.so_number}</p>
                  <p className="text-sm text-slate-600">{new Date(fitting.scheduled_at).toLocaleString()} · {fitting.notes || "No notes"}</p>
                </div>
                <select value={fitting.status} onChange={(event) => void updateFitting(fitting.id, event.target.value as SalesFittingStatus)} className="min-h-11 rounded-lg border px-3">
                  <option value="scheduled">Scheduled</option><option value="done">Done</option>
                  <option value="no_show">No-show</option><option value="cancelled">Cancelled</option>
                </select>
              </div>
            );
          })}
        </section>
      )}

      {data && tab === "production" && (
        <section className="space-y-3">
          {data.milestones.map((row) => (
            <div key={row.sales_order_id} className={`rounded-xl border p-4 ${row.needs_attention ? "border-amber-400 bg-amber-50" : "bg-white"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-900">{row.client_name?.trim() || "—"}</p>
                  <p className="mt-0.5 text-sm font-medium text-indigo-700">{row.so_number}</p>
                  <p className="text-sm text-slate-600">{label(row.milestone)}</p>
                  {row.needs_attention && <p className="mt-1 text-sm font-semibold text-amber-800">Action needed: contact the client to arrange fitting or delivery.</p>}
                </div>
                <div className="flex gap-2">
                  <select value={row.milestone} onChange={(event) => void updateMilestone(row.sales_order_id, event.target.value as SalesMilestone)} className="min-h-11 rounded-lg border px-3">
                    {MILESTONES.map((milestone) => <option key={milestone} value={milestone}>{label(milestone)}</option>)}
                  </select>
                  {row.needs_attention && <Button variant="secondary" onClick={() => void updateMilestone(row.sales_order_id, row.milestone, true)}>Acknowledge</Button>}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
