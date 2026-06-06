"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EmailPreview } from "@/components/purchasing/EmailPreview";
import { Button } from "@/components/ui/Button";
import { purchaseOrderToEmail } from "@/lib/fabric-sourcing/email-content";
import type { PurchaseOrder, SupplierFabric } from "@/lib/types/fabric-sourcing";
import type { SalesOrder } from "@/lib/types/sales-orders";
import { getDeliveryDestination } from "@/lib/shipping/delivery-destinations";

type FabricPosReviewProps = {
  salesOrderId: string;
};

export function FabricPosReview({ salesOrderId }: FabricPosReviewProps) {
  const [salesOrder, setSalesOrder] = useState<SalesOrder | null>(null);
  const [fabricOrders, setFabricOrders] = useState<PurchaseOrder[]>([]);
  const [fabricsBySupplier, setFabricsBySupplier] = useState<Record<string, SupplierFabric[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orderRes = await fetch(`/api/sales-orders/${salesOrderId}`);
      if (!orderRes.ok) throw new Error("Failed to load sales order");
      const orderData = await orderRes.json();
      setSalesOrder(orderData.order as SalesOrder);

      const poRes = await fetch(`/api/fabric-orders?sales_order_id=${encodeURIComponent(salesOrderId)}`);
      if (!poRes.ok) throw new Error("Failed to load fabric orders");
      const poData = await poRes.json();
      const orders = (poData.orders ?? []) as PurchaseOrder[];
      setFabricOrders(orders);

      const supplierIds = [...new Set(orders.map((po) => po.supplier_id))];
      const specsMap: Record<string, SupplierFabric[]> = {};
      await Promise.all(
        supplierIds.map(async (supplierId) => {
          const res = await fetch(`/api/supplier-fabrics?supplier_id=${encodeURIComponent(supplierId)}`);
          if (!res.ok) {
            specsMap[supplierId] = [];
            return;
          }
          const data = await res.json();
          specsMap[supplierId] = (data.items ?? []) as SupplierFabric[];
        })
      );
      setFabricsBySupplier(specsMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fabric orders");
    } finally {
      setLoading(false);
    }
  }, [salesOrderId]);

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

  if (!salesOrder) return null;

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4 text-sm text-indigo-900">
        <p className="font-medium">
          {fabricOrders.length} supplier email{fabricOrders.length !== 1 ? "s" : ""} for {salesOrder.so_number}
        </p>
        <p className="mt-1 text-indigo-800">
          Client code on all emails:{" "}
          <span className="font-mono font-semibold">{salesOrder.client_code}</span>
          {salesOrder.delivery_destination && (
            <>
              {" · "}
              Ship to:{" "}
              <span className="font-semibold">
                {getDeliveryDestination(salesOrder.delivery_destination)?.label ?? salesOrder.delivery_destination}
              </span>
            </>
          )}
        </p>
      </div>

      {fabricOrders.length === 0 ? (
        <p className="text-sm text-slate-500">No fabric orders yet — create them from the sales order page.</p>
      ) : (
        fabricOrders.map((po) => {
          const fabrics = fabricsBySupplier[po.supplier_id] ?? [];
          const email = purchaseOrderToEmail(po, fabrics, {
            clientCode: salesOrder.client_code,
            deliveryDestination: salesOrder.delivery_destination,
          });

          return (
            <div key={po.id} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900">
                  {po.supplier?.name ?? po.supplier_id}{" "}
                  <span className="font-mono text-sm font-normal text-slate-500">{po.po_number}</span>
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/orders/${salesOrderId}/stickers?po=${encodeURIComponent(po.po_number)}`}>
                    <Button variant="secondary" size="sm">
                      Print stickers
                    </Button>
                  </Link>
                  {po.emailed_at ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                      Sent {new Date(po.emailed_at).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                      Not sent yet
                    </span>
                  )}
                </div>
              </div>
              <EmailPreview
                email={email}
                poNumber={po.po_number}
                onSent={(result) => void handleSent(po.id, result)}
              />
            </div>
          );
        })
      )}
    </div>
  );
}
