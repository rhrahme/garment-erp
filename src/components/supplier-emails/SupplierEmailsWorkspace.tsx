"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { EmailPreview } from "@/components/purchasing/EmailPreview";
import { purchaseOrdersBatchToEmail, formatDeliveryDestinationForSubject } from "@/lib/fabric-sourcing/email-content";
import type {
  SupplierEmailBatch,
  SupplierEmailQueueItem,
} from "@/lib/fabric-sourcing/supplier-email-queue";
import type { SupplierFabric } from "@/lib/types/fabric-sourcing";

export function SupplierEmailsWorkspace() {
  const searchParams = useSearchParams();
  const salesOrderFilter = searchParams.get("sales_order_id");

  const [batches, setBatches] = useState<SupplierEmailBatch[]>([]);
  const [fabricsBySupplier, setFabricsBySupplier] = useState<Record<string, SupplierFabric[]>>({});
  const [factoryEmail, setFactoryEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const message = sessionStorage.getItem("todays_fabric_flash");
    if (!message) return;
    sessionStorage.removeItem("todays_fabric_flash");
    setFlash(message);
  }, []);

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
      const data = (await res.json()) as { batches: SupplierEmailBatch[] };
      const loadedBatches = data.batches ?? [];
      setBatches(loadedBatches);

      const supplierIds = [...new Set(loadedBatches.map((batch) => batch.supplier_id))];
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

  async function handleSent(poIds: string[], result: { emailedAt: string; emailTo: string }) {
    await fetch("/api/fabric-orders/mark-sent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: poIds,
        emailed_at: result.emailedAt,
        email_to: result.emailTo,
      }),
    });
    void load();
  }

  const pendingBatches = batches.filter((batch) => batch.is_pending);
  const sentBatches = batches.filter((batch) => !batch.is_pending);
  const pendingPoCount = pendingBatches.reduce((sum, batch) => sum + batch.orders.length, 0);

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
      {flash && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {flash}
        </div>
      )}
      {salesOrderFilter && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          Showing emails for one sales order.{" "}
          <Link href="/supplier-emails" className="font-medium underline">
            View all
          </Link>{" "}
          to combine pending orders to the same supplier across clients.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{pendingBatches.length}</p>
          <p className="text-xs font-medium text-slate-600">Suppliers awaiting send</p>
          {pendingPoCount > pendingBatches.length && (
            <p className="mt-1 text-xs text-slate-500">{pendingPoCount} POs consolidated</p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{sentBatches.length}</p>
          <p className="text-xs font-medium text-slate-600">Sent batches</p>
        </div>
      </div>

      {batches.length === 0 ? (
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
          {pendingBatches.length > 0 && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold text-slate-900">Ready to send</h2>
              {pendingBatches.map((batch) => (
                <SupplierEmailBatchCard
                  key={batch.id}
                  batch={batch}
                  fabrics={fabricsBySupplier[batch.supplier_id] ?? []}
                  factoryEmail={factoryEmail}
                  onSent={(poIds, result) => void handleSent(poIds, result)}
                />
              ))}
            </section>
          )}

          {sentBatches.length > 0 && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold text-slate-900">Sent</h2>
              {sentBatches.map((batch) => (
                <SupplierEmailBatchCard
                  key={batch.id}
                  batch={batch}
                  fabrics={fabricsBySupplier[batch.supplier_id] ?? []}
                  factoryEmail={factoryEmail}
                  onSent={(poIds, result) => void handleSent(poIds, result)}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SupplierEmailBatchCard({
  batch,
  fabrics,
  factoryEmail,
  onSent,
}: {
  batch: SupplierEmailBatch;
  fabrics: SupplierFabric[];
  factoryEmail: string | null;
  onSent: (poIds: string[], result: { emailedAt: string; emailTo: string }) => void;
}) {
  const showOrderPicker = batch.orders.length > 1 && !batch.emailed_at;
  const [selectedPoIds, setSelectedPoIds] = useState<Set<string>>(
    () => new Set(batch.orders.map((order) => order.id))
  );

  useEffect(() => {
    setSelectedPoIds(new Set(batch.orders.map((order) => order.id)));
  }, [batch.id, batch.orders]);

  const selectedOrders = useMemo(
    () => batch.orders.filter((order) => selectedPoIds.has(order.id)),
    [batch.orders, selectedPoIds]
  );

  const emailOptions = useMemo(
    () => ({
      fromEmail: factoryEmail,
      clientCodeByPoId: Object.fromEntries(
        batch.orders.map((order) => [order.id, order.client_code ?? "—"])
      ),
      soNumberByPoId: Object.fromEntries(batch.orders.map((order) => [order.id, order.so_number])),
      deliveryDestinationByPoId: Object.fromEntries(
        batch.orders.map((order) => [order.id, order.delivery_destination])
      ),
    }),
    [batch.orders, factoryEmail]
  );

  const email = useMemo(() => {
    if (selectedOrders.length === 0) {
      const first = batch.orders[0];
      if (!first) {
        throw new Error("Batch has no purchase orders.");
      }
      const base = purchaseOrdersBatchToEmail([first], fabrics, emailOptions);
      const destinationLabel = formatDeliveryDestinationForSubject(
        batch.orders.map((order) => order.delivery_destination)
      );
      return {
        ...base,
        subject: `Fabric Orders — ${batch.supplier_name}${destinationLabel ? ` — ${destinationLabel}` : ""}`,
        body: "Select at least one order above to preview the supplier email.",
      };
    }
    return purchaseOrdersBatchToEmail(selectedOrders, fabrics, emailOptions);
  }, [selectedOrders, batch.orders, batch.supplier_name, fabrics, emailOptions]);

  const poNumbers = selectedOrders.map((order) => order.po_number);
  const selectedPoIdsList = selectedOrders.map((order) => order.id);
  const orderCount = new Set(selectedOrders.map((order) => order.sales_order_id).filter(Boolean)).size;
  const fabricLineCount = selectedOrders.reduce((sum, order) => sum + (order.lines?.length ?? 0), 0);
  const summaryParts = [
    orderCount > 0 ? `${orderCount} order${orderCount !== 1 ? "s" : ""}` : null,
    `${fabricLineCount} fabric line${fabricLineCount !== 1 ? "s" : ""}`,
  ].filter(Boolean);

  function toggleOrderIncluded(orderId: string, included: boolean) {
    setSelectedPoIds((current) => {
      const next = new Set(current);
      if (included) {
        next.add(orderId);
      } else {
        next.delete(orderId);
      }
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {batch.supplier_name}{" "}
            <span className="font-mono text-sm font-normal text-slate-500">
              {poNumbers.length === 1 ? poNumbers[0] : `${poNumbers.length} POs`}
            </span>
          </h3>
          <p className="mt-0.5 text-sm text-slate-600">
            {summaryParts.join(" · ")}
            {batch.combines_multiple_orders && (
              <>
                {" · "}
                <span className="font-medium text-indigo-700">Combined across clients</span>
              </>
            )}
          </p>
          {showOrderPicker ? (
            <BatchOrderPicker
              supplierName={batch.supplier_name}
              orders={batch.orders}
              selectedPoIds={selectedPoIds}
              onToggle={toggleOrderIncluded}
            />
          ) : (
            <BatchOrderLinks orders={batch.orders} />
          )}
        </div>
        {batch.emailed_at ? (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
            Sent {new Date(batch.emailed_at).toLocaleDateString()}
            {batch.orders[0]?.email_to ? ` · ${batch.orders[0].email_to}` : ""}
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">Not sent yet</span>
        )}
      </div>
      <EmailPreview
        email={email}
        poNumber={poNumbers[0]}
        poNumbers={poNumbers}
        onSent={(result) => onSent(selectedPoIdsList, result)}
      />
    </div>
  );
}

function BatchOrderPicker({
  supplierName,
  orders,
  selectedPoIds,
  onToggle,
}: {
  supplierName: string;
  orders: SupplierEmailQueueItem[];
  selectedPoIds: Set<string>;
  onToggle: (orderId: string, included: boolean) => void;
}) {
  return (
    <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2">
      <p className="text-xs font-medium text-indigo-900">Send together to {supplierName}</p>
      <ul className="mt-2 space-y-1.5">
        {orders.map((order) => {
          const checked = selectedPoIds.has(order.id);
          const lineCount = order.lines?.length ?? 0;
          return (
            <li key={order.id}>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => onToggle(order.id, event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                />
                <span>
                  <span className="font-medium text-slate-900">Include in this email</span>
                  {order.so_number && (
                    <>
                      {" — "}
                      <span className="font-mono">{order.so_number}</span>
                    </>
                  )}
                  {order.client_code && (
                    <>
                      {" · "}
                      <span className="font-mono text-indigo-700">{order.client_code}</span>
                    </>
                  )}
                  {order.po_number && (
                    <>
                      {" · "}
                      <span className="font-mono text-slate-500">{order.po_number}</span>
                    </>
                  )}
                  {lineCount > 0 && (
                    <>
                      {" · "}
                      <span className="text-slate-500">
                        {lineCount} fabric line{lineCount !== 1 ? "s" : ""}
                      </span>
                    </>
                  )}
                  {order.sales_order_id && (
                    <>
                      {" "}
                      <Link
                        href={`/orders/${order.sales_order_id}`}
                        className="text-indigo-600 hover:text-indigo-700"
                        onClick={(event) => event.stopPropagation()}
                      >
                        View
                      </Link>
                    </>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BatchOrderLinks({ orders }: { orders: SupplierEmailQueueItem[] }) {
  const uniqueOrders = orders.filter(
    (order, index, list) =>
      order.sales_order_id && list.findIndex((item) => item.sales_order_id === order.sales_order_id) === index
  );

  if (uniqueOrders.length === 0) return null;

  return (
    <p className="mt-1 text-sm text-slate-600">
      {uniqueOrders.map((order, index) => (
        <span key={order.id}>
          {index > 0 && " · "}
          {order.so_number && <span className="font-mono">{order.so_number}</span>}
          {order.so_number && order.client_code && " — "}
          {order.client_code && <span className="font-mono text-indigo-700">{order.client_code}</span>}
          {order.sales_order_id && (
            <>
              {" "}
              <Link href={`/orders/${order.sales_order_id}`} className="text-indigo-600 hover:text-indigo-700">
                View
              </Link>
            </>
          )}
        </span>
      ))}
    </p>
  );
}
