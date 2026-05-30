"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DeliveryDestinationTabs } from "@/components/shipping/DeliveryDestinationTabs";
import { formatLabelGarmentDescription } from "@/lib/sales-orders/label-codes";
import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";
import { formatSupplierUnitPrice } from "@/lib/currency/format";

function formatWidth(line: SalesOrderFabricLine) {
  if (line.width_cm != null) return `${line.width_cm} cm`;
  if (line.width_inches != null) return `${line.width_inches}"`;
  return "—";
}

function formatLinePrice(line: SalesOrderFabricLine) {
  if (!line.unit_price) return "—";
  return formatSupplierUnitPrice(line.unit_price, line.supplier_id, line.unit);
}

export function SalesOrderActions({ order }: { order: SalesOrder }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [savingDestination, setSavingDestination] = useState(false);
  const [deliveryDestination, setDeliveryDestination] = useState<DeliveryDestination | "">(
    order.delivery_destination ?? ""
  );
  const [error, setError] = useState<string | null>(null);

  const supplierGroups = order.fabric_lines.reduce<
    Record<string, { name: string; lines: typeof order.fabric_lines }>
  >((acc, line) => {
    const bucket = acc[line.supplier_id] ?? { name: line.supplier_name, lines: [] };
    bucket.lines.push(line);
    acc[line.supplier_id] = bucket;
    return acc;
  }, {});

  const allStickers = order.fabric_lines.flatMap((line) =>
    (line.label_stickers ?? []).map((sticker) => ({
      ...sticker,
      fabric_number: line.fabric_number,
      garment_type: line.garment_type,
      supplier_name: line.supplier_name,
    }))
  );

  async function saveDeliveryDestination(next: DeliveryDestination) {
    setSavingDestination(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delivery_destination: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save delivery destination");
      setDeliveryDestination(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save delivery destination");
    } finally {
      setSavingDestination(false);
    }
  }

  function handleDestinationChange(next: DeliveryDestination) {
    setDeliveryDestination(next);
    if (order.delivery_destination !== next) {
      void saveDeliveryDestination(next);
    }
  }

  async function createFabricPos() {
    if (!order.delivery_destination && !deliveryDestination) {
      setError("Select a fabric delivery destination before creating supplier emails.");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      if (!order.delivery_destination) {
        const saveRes = await fetch(`/api/sales-orders/${order.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delivery_destination: deliveryDestination }),
        });
        const saveData = await saveRes.json();
        if (!saveRes.ok) {
          throw new Error(saveData.error ?? "Failed to save delivery destination");
        }
      }

      const res = await fetch(`/api/sales-orders/${order.id}/fabric-pos`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create fabric orders");
      router.push(`/supplier-emails?sales_order_id=${order.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create fabric orders");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <DeliveryDestinationTabs
        value={deliveryDestination}
        onChange={handleDestinationChange}
        disabled={savingDestination}
      />

      {allStickers.length > 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-6">
          <h2 className="text-lg font-semibold text-slate-900">Label sticker codes</h2>
          <p className="mt-1 text-sm text-slate-600">
            One unique code per garment piece — the fabric supplier prints these on stickers so production can identify
            the client and garment when fabric arrives.
          </p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-indigo-100 bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Sticker code</th>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Garment</th>
                  <th className="px-3 py-2">Fabric</th>
                  <th className="px-3 py-2">Supplier</th>
                </tr>
              </thead>
              <tbody>
                {allStickers.map((sticker) => (
                  <tr key={sticker.code} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-mono font-medium text-indigo-800">{sticker.code}</td>
                    <td className="px-3 py-2 text-slate-700">{order.client_name}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {formatLabelGarmentDescription(sticker.garment_type, sticker.piece_name)}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700">{sticker.fabric_number}</td>
                    <td className="px-3 py-2 text-slate-600">{sticker.supplier_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Fabrics by supplier</h2>
        <p className="mt-1 text-sm text-slate-500">
          One consolidated email will be created per supplier. Send them from Supplier Emails in the sidebar.
        </p>
        <div className="mt-4 space-y-4">
          {Object.entries(supplierGroups).map(([supplierId, group]) => (
            <div key={supplierId} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">{group.name}</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                {group.lines.map((line) => (
                  <li key={line.id} className="rounded border border-slate-200 bg-white px-3 py-2">
                    <p className="font-mono font-medium text-slate-900">
                      {line.fabric_number} — {line.quantity} {line.unit === "meters" ? "m" : line.unit}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[
                        line.garment_type,
                        `${line.label_count} label${line.label_count !== 1 ? "s" : ""}`,
                        line.composition,
                        line.weight_gsm != null ? `${line.weight_gsm} gsm` : null,
                        formatWidth(line),
                        formatLinePrice(line),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {(line.label_stickers ?? []).length > 0 && (
                      <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                        {line.label_stickers.map((sticker) => (
                          <li key={sticker.code} className="font-mono text-xs text-indigo-700">
                            {sticker.code}
                            <span className="ml-2 font-sans text-slate-500">
                              {formatLabelGarmentDescription(line.garment_type, sticker.piece_name)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {order.fabric_po_ids.length > 0 ? (
          <Link href={`/supplier-emails?sales_order_id=${order.id}`}>
            <Button>Send supplier emails</Button>
          </Link>
        ) : (
          <Button
            onClick={() => void createFabricPos()}
            disabled={creating || (!order.delivery_destination && !deliveryDestination)}
          >
            {creating ? "Creating…" : "Create fabric orders for suppliers"}
          </Button>
        )}
        <Link href="/supplier-inbox">
          <Button variant="secondary">Supplier inbox</Button>
        </Link>
        <Link href="/orders/new">
          <Button variant="secondary">New sales order</Button>
        </Link>
      </div>

      {order.client_reference && (
        <p className="text-sm text-slate-500">
          Client reference: <span className="font-mono text-indigo-700">{order.client_reference}</span>
        </p>
      )}

      <Badge className="bg-slate-100 text-slate-700">Status: {order.status.replace(/_/g, " ")}</Badge>
    </div>
  );
}
