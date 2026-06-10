"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { EmailPreview } from "@/components/purchasing/EmailPreview";
import { purchaseOrderToEmail } from "@/lib/fabric-sourcing/email-content";
import type { SupplierEmailQueueItem } from "@/lib/fabric-sourcing/supplier-email-queue";
import type { SupplierFabric } from "@/lib/types/fabric-sourcing";

export function SupplierEmailsWorkspace() {
  const searchParams = useSearchParams();
  const salesOrderFilter = searchParams.get("sales_order_id");

  const [orders, setOrders] = useState<SupplierEmailQueueItem[]>([]);
  const [fabricsBySupplier, setFabricsBySupplier] = useState<Record<string, SupplierFabric[]>>({});
  const [factoryEmail, setFactoryEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = salesOrderFilter ? `?sales_order_id=${encodeURIComponent(salesOrderFilter)}` : "";
      const [res, statusRes] = await Promise.all([
        fetch(`/api/supplier-emails${query}`),
        fetch("/api/email/status"),
      ]);
      if (!res.ok) throw new Error("Failed to load supplier emails");
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setFactoryEmail(statusData.factoryOrdersEmail ?? statusData.from ?? null);
      }
      const data = (await res.json()) as { orders: SupplierEmailQueueItem[] };
      const loadedOrders = data.orders;
      setOrders(loadedOrders);

      const supplierIds = [...new Set(loadedOrders.map((order) => order.supplier_id))];
      const specsMap: Record<string, SupplierFabric[]> = {};
      await Promise.all(
        supplierIds.map(async (supplierId) => {
          const fabricRes = await fetch(`/api/supplier-fabrics?supplier_id=${encodeURIComponent(supplierId)}`);
          if (!fabricRes.ok) {
            specsMap[supplierId] = [];
            return;
          }
          const fabricData = await fabricRes.json();
          specsMap[supplierId] = (fabricData.items ?? []) as SupplierFabric[];
        })
      );
      setFabricsBySupplier(specsMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load supplier emails");
    } finally {
      setLoading(false);
    }
  }, [salesOrderFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSent(poId: string, result: { emailedAt: string; emailTo: string }) {
    await fetch(`/api/fabric-orders/${poId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailed_at: result.emailedAt, email_to: result.emailTo }),
    });
    void load();
  }

  const pendingOrders = orders.filter((order) => !order.emailed_at);
  const sentOrders = orders.filter((order) => order.emailed_at);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
        Loading supplier emails…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
    );
  }

  return (
    <div className="space-y-8">
      {salesOrderFilter && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          Showing emails for one sales order.{" "}
          <Link href="/supplier-emails" className="font-medium underline">
            View all
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{pendingOrders.length}</p>
          <p className="text-xs font-medium text-slate-600">Awaiting send</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{sentOrders.length}</p>
          <p className="text-xs font-medium text-slate-600">Sent</p>
        </div>
      </div>

      {orders.length === 0 ? (
        salesOrderFilter ? (
          <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 px-6 py-10 text-center text-sm text-amber-900">
            <p className="font-medium">No supplier emails exist for this order yet.</p>
            <p className="mt-1 text-amber-800">
              Open the order and use “Create fabric orders for suppliers” to generate the supplier
              POs, then come back here to send them.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link
                href={`/fabric-orders/${salesOrderFilter}`}
                className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
              >
                Open this order
              </Link>
              <Link
                href="/supplier-emails"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
              >
                View all supplier emails
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
            No supplier emails yet — create fabric orders from a{" "}
            <Link href="/orders" className="font-medium text-indigo-600 hover:text-indigo-700">
              sales order
            </Link>{" "}
            first.
          </div>
        )
      ) : (
        <>
          {pendingOrders.length > 0 && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold text-slate-900">Ready to send</h2>
              {pendingOrders.map((po) => (
                <SupplierEmailCard
                  key={po.id}
                  order={po}
                  fabrics={fabricsBySupplier[po.supplier_id] ?? []}
                  factoryEmail={factoryEmail}
                  onSent={(result) => void handleSent(po.id, result)}
                />
              ))}
            </section>
          )}

          {sentOrders.length > 0 && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold text-slate-900">Sent</h2>
              {sentOrders.map((po) => (
                <SupplierEmailCard
                  key={po.id}
                  order={po}
                  fabrics={fabricsBySupplier[po.supplier_id] ?? []}
                  factoryEmail={factoryEmail}
                  onSent={(result) => void handleSent(po.id, result)}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SupplierEmailCard({
  order,
  fabrics,
  factoryEmail,
  onSent,
}: {
  order: SupplierEmailQueueItem;
  fabrics: SupplierFabric[];
  factoryEmail: string | null;
  onSent: (result: { emailedAt: string; emailTo: string }) => void;
}) {
  const email = purchaseOrderToEmail(order, fabrics, {
    clientCode: order.client_code ?? undefined,
    deliveryDestination: order.delivery_destination,
    fromEmail: factoryEmail,
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {order.supplier?.name ?? order.supplier_id}{" "}
            <span className="font-mono text-sm font-normal text-slate-500">{order.po_number}</span>
          </h3>
          <p className="mt-0.5 text-sm text-slate-600">
            {order.so_number && (
              <>
                {order.so_number}
                {" · "}
              </>
            )}
            Client: <span className="font-mono text-indigo-700">{order.client_code ?? "—"}</span>
            {!order.delivery_destination && (
              <>
                {" · "}
                <span className="font-medium text-amber-700">Ship-to not set on sales order</span>
              </>
            )}
            {order.sales_order_id && (
              <>
                {" · "}
                <Link href={`/orders/${order.sales_order_id}`} className="text-indigo-600 hover:text-indigo-700">
                  View sales order
                </Link>
              </>
            )}
          </p>
        </div>
        {order.emailed_at ? (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
            Sent {new Date(order.emailed_at).toLocaleDateString()}
            {order.email_to ? ` · ${order.email_to}` : ""}
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">Not sent yet</span>
        )}
      </div>
      <EmailPreview email={email} poNumber={order.po_number} onSent={onSent} />
    </div>
  );
}
