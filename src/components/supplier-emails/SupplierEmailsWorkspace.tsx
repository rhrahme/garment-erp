"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, MessageSquarePlus } from "lucide-react";
import { EmailPreview } from "@/components/purchasing/EmailPreview";
import { Button } from "@/components/ui/Button";
import {
  buildFollowUpEmailDraft,
  purchaseOrdersBatchToEmail,
  formatDeliveryDestinationForSubject,
} from "@/lib/fabric-sourcing/email-content";
import {
  groupSupplierEmailBatches,
  type SupplierEmailBatch,
  type SupplierEmailQueueItem,
} from "@/lib/fabric-sourcing/supplier-email-batches";
import type { SupplierFabric } from "@/lib/types/fabric-sourcing";
import { formatDateTimeRiyadh } from "@/lib/utils";
import { useSearchParams } from "next/navigation";

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

  const applySentOptimistic = useCallback(
    (poIds: string[], result: { emailedAt: string; emailTo: string }) => {
      setBatches((current) => {
        const allOrders = current.flatMap((batch) => batch.orders);
        const updatedOrders = allOrders.map((order) =>
          poIds.includes(order.id)
            ? { ...order, emailed_at: result.emailedAt, email_to: result.emailTo, status: "sent" as const }
            : order
        );
        return groupSupplierEmailBatches(updatedOrders, { consolidate: !salesOrderFilter });
      });
    },
    [salesOrderFilter]
  );

  async function handleSent(poIds: string[], result: { emailedAt: string; emailTo: string }) {
    applySentOptimistic(poIds, result);

    const res = await fetch("/api/fabric-orders/mark-sent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: poIds,
        emailed_at: result.emailedAt,
        email_to: result.emailTo,
      }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setFlash(data.error ?? "Failed to mark orders as sent. Refresh and try again.");
      void load();
      return;
    }

    setFlash(`Email sent to supplier · ${result.emailTo}`);
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
                <PendingSupplierEmailBatchCard
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
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Sent</h2>
              {sentBatches.map((batch) => (
                <SentSupplierEmailBatchCard
                  key={batch.id}
                  batch={batch}
                  fabrics={fabricsBySupplier[batch.supplier_id] ?? []}
                  factoryEmail={factoryEmail}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function useBatchEmailOptions(batch: SupplierEmailBatch, factoryEmail: string | null) {
  return useMemo(
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
}

function PendingSupplierEmailBatchCard({
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
  const showOrderPicker = batch.orders.length > 1;
  const [selectedPoIds, setSelectedPoIds] = useState<Set<string>>(
    () => new Set(batch.orders.map((order) => order.id))
  );

  useEffect(() => {
    setSelectedPoIds(new Set(batch.orders.map((order) => order.id)));
  }, [batch.id, batch.orders]);

  const emailOptions = useBatchEmailOptions(batch, factoryEmail);

  const selectedOrders = useMemo(
    () => batch.orders.filter((order) => selectedPoIds.has(order.id)),
    [batch.orders, selectedPoIds]
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
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <BatchHeader
        batch={batch}
        poNumbers={poNumbers}
        summaryParts={summaryParts}
        status="pending"
      />
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
      <EmailPreview
        email={email}
        poNumber={poNumbers[0]}
        poNumbers={poNumbers}
        onSent={(result) => onSent(selectedPoIdsList, result)}
      />
    </div>
  );
}

function SentSupplierEmailBatchCard({
  batch,
  fabrics,
  factoryEmail,
}: {
  batch: SupplierEmailBatch;
  fabrics: SupplierFabric[];
  factoryEmail: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);

  const emailOptions = useBatchEmailOptions(batch, factoryEmail);
  const poNumbers = batch.orders.map((order) => order.po_number);
  const orderCount = new Set(batch.orders.map((order) => order.sales_order_id).filter(Boolean)).size;
  const fabricLineCount = batch.fabric_line_count;
  const summaryParts = [
    orderCount > 0 ? `${orderCount} order${orderCount !== 1 ? "s" : ""}` : null,
    `${fabricLineCount} fabric line${fabricLineCount !== 1 ? "s" : ""}`,
  ].filter(Boolean);
  const sentAtLabel = batch.emailed_at ? formatDateTimeRiyadh(batch.emailed_at) : "—";
  const sentTo = batch.orders.find((order) => order.email_to)?.email_to ?? null;

  const originalEmail = useMemo(
    () => purchaseOrdersBatchToEmail(batch.orders, fabrics, emailOptions),
    [batch.orders, fabrics, emailOptions]
  );

  const followUpEmail = useMemo(
    () => buildFollowUpEmailDraft(originalEmail, sentAtLabel),
    [originalEmail, sentAtLabel]
  );

  function openFollowUp() {
    setShowFollowUp(true);
    setExpanded(true);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          ) : (
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          )}
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">
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
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-mono text-xs text-slate-500">
                {poNumbers.length <= 3 ? poNumbers.join(", ") : `${poNumbers.slice(0, 3).join(", ")} +${poNumbers.length - 3} more`}
              </span>
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              Sent {sentAtLabel}
              {sentTo ? ` · ${sentTo}` : ""}
            </p>
            <BatchOrderLinks orders={batch.orders} />
          </div>
        </button>
        <div className="flex flex-wrap gap-2">
          {batch.orders.length === 1 && (
            <Link href={`/shipments?po_id=${encodeURIComponent(batch.orders[0]!.id)}`}>
              <Button variant="secondary" size="sm">
                Add AWB
              </Button>
            </Link>
          )}
          <Button variant="secondary" size="sm" onClick={openFollowUp}>
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            Send follow-up
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-4 sm:px-5">
          {showFollowUp ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900">Follow-up email</p>
              <p className="text-xs text-slate-500">
                Sends a new email — original POs stay marked as sent.
              </p>
              <EmailPreview email={followUpEmail} poNumber={poNumbers[0]} poNumbers={poNumbers} />
            </div>
          ) : (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Original email sent</p>
              <p className="mt-1">
                Subject: <span className="text-slate-800">{originalEmail.subject}</span>
              </p>
              <p className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-600">
                {originalEmail.body.slice(0, 400)}
                {originalEmail.body.length > 400 ? "…" : ""}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BatchHeader({
  batch,
  poNumbers,
  summaryParts,
  status,
}: {
  batch: SupplierEmailBatch;
  poNumbers: string[];
  summaryParts: (string | null)[];
  status: "pending" | "sent";
}) {
  return (
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
      </div>
      {status === "pending" ? (
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">Ready to send</span>
      ) : (
        batch.emailed_at && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
            Sent {formatDateTimeRiyadh(batch.emailed_at)}
          </span>
        )
      )}
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
