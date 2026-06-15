"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { DownloadSalesOrderPdfButton } from "@/components/orders/DownloadSalesOrderPdfButton";
import { Badge } from "@/components/ui/Badge";
import { DeleteSalesOrderButton } from "@/components/orders/DeleteSalesOrderButton";
import { FabricPriceRevealToggle, MaskedFabricPrice } from "@/components/orders/FabricPriceRevealToggle";
import { CreateInvoiceButton } from "@/components/invoicing/CreateInvoiceButton";
import { DeliveryDestinationTabs } from "@/components/shipping/DeliveryDestinationTabs";
import { FabricReplacementBadge, FabricStockBadge } from "@/components/fabric/FabricStockBadge";
import { formatFabricStockLabel } from "@/lib/fabric-sourcing/fabric-stock";
import { FabricSupplierName } from "@/components/fabric/FabricSupplierName";
import { fabricSupplierGroupKey, formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";
import { formatSupplierUnitPrice } from "@/lib/currency/format";
import { getFabricTotalsSummary } from "@/lib/sales-orders/fabric-weight";
import { ordersUiLabels } from "@/lib/orders/ui-labels";
import { ProductionOrderAddFabrics } from "@/components/orders/ProductionOrderAddFabrics";
import { OrderFabricLineEditor } from "@/components/orders/OrderFabricLineEditor";
import { OrderFabricLineRemove } from "@/components/orders/OrderFabricLineRemove";
import { canAppendFabricLines, canEditFabricLines, fabricLineEditBlockedReason } from "@/lib/sales-orders/fabric-lines-rules";
import { formatLabelGarmentDescription } from "@/lib/sales-orders/label-codes";
import { formatFabricLineLabels } from "@/lib/sales-orders/label-display";
import { FabricOrderSubmitButton } from "@/components/orders/FabricOrderSubmitButton";
import { fabricOrderUiLabels } from "@/lib/orders/fabric-order-ui-labels";
import { formatDateTime } from "@/lib/utils";

export type SalesOrderViewMode = "fabric_order" | "production" | "sales";

function formatWidth(line: SalesOrderFabricLine) {
  if (line.width_cm != null) return `${line.width_cm} cm`;
  if (line.width_inches != null) return `${line.width_inches}"`;
  return "—";
}

function formatLinePrice(line: SalesOrderFabricLine) {
  if (!line.unit_price) return "—";
  return formatSupplierUnitPrice(line.unit_price, line.supplier_id, line.unit);
}

export function SalesOrderActions({
  order,
  existingInvoiceId = null,
  isReadyMade = false,
  canViewFabricPrices = false,
  isClientManager = false,
  productionMode = false,
  viewMode = "sales",
}: {
  order: SalesOrder;
  existingInvoiceId?: string | null;
  isReadyMade?: boolean;
  canViewFabricPrices?: boolean;
  isClientManager?: boolean;
  productionMode?: boolean;
  viewMode?: SalesOrderViewMode;
}) {
  const effectiveViewMode: SalesOrderViewMode =
    viewMode !== "sales" ? viewMode : productionMode ? "production" : "sales";
  const fabricLabels = fabricOrderUiLabels(isClientManager);
  const labels =
    effectiveViewMode === "fabric_order" ? fabricLabels : ordersUiLabels(productionMode);
  const showFabricOrdering = effectiveViewMode === "fabric_order";
  const showSalesAdmin = effectiveViewMode === "sales";
  const showProductionLabels = effectiveViewMode === "production" || showSalesAdmin;
  const showFabricInput = showFabricOrdering || showSalesAdmin;
  const showSupplierEmailActions = showFabricOrdering || showSalesAdmin;
  const router = useRouter();
  const [liveOrder, setLiveOrder] = useState(order);
  const [creating, setCreating] = useState(false);
  const [savingDestination, setSavingDestination] = useState(false);
  const [deliveryDestination, setDeliveryDestination] = useState<DeliveryDestination | "">(
    liveOrder.delivery_destination ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setLiveOrder(order);
  }, [order]);

  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) return;
        const data = (await res.json()) as { is_admin?: boolean };
        setIsAdmin(Boolean(data.is_admin));
      } catch {
        /* ignore */
      }
    }
    void loadSession();
  }, []);

  const supplierGroups = liveOrder.fabric_lines.reduce<
    Record<string, { name: string; lines: typeof liveOrder.fabric_lines }>
  >((acc, line) => {
    const key = fabricSupplierGroupKey(line.supplier_id, line.fabric_number);
    const name = formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number);
    const bucket = acc[key] ?? { name, lines: [] };
    bucket.lines.push(line);
    acc[key] = bucket;
    return acc;
  }, {});

  const fabricTotals = getFabricTotalsSummary(liveOrder.fabric_lines);
  const fabricLinesEditable = canEditFabricLines(liveOrder);
  const fabricEditBlockedReason = fabricLineEditBlockedReason(liveOrder);
  const fabricsEditable = showFabricInput && fabricLinesEditable;

  function handleLineUpdated(updatedLine: SalesOrderFabricLine) {
    setLiveOrder((prev) => ({
      ...prev,
      fabric_lines: prev.fabric_lines.map((line) => (line.id === updatedLine.id ? updatedLine : line)),
    }));
    router.refresh();
  }

  function handleLineRemoved(lineId: string) {
    setLiveOrder((prev) => ({
      ...prev,
      fabric_lines: prev.fabric_lines.filter((line) => line.id !== lineId),
    }));
    router.refresh();
  }

  const allStickers = liveOrder.fabric_lines.flatMap((line) =>
    (line.label_stickers ?? []).map((sticker) => ({
      ...sticker,
      fabric_number: line.fabric_number,
      garment_type: line.garment_type,
      supplier_id: line.supplier_id,
      supplier_name: formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number),
    }))
  );

  async function saveDeliveryDestination(next: DeliveryDestination) {
    setSavingDestination(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${liveOrder.id}`, {
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
    if (liveOrder.delivery_destination !== next) {
      void saveDeliveryDestination(next);
    }
  }

  async function createFabricPos() {
    if (!liveOrder.delivery_destination && !deliveryDestination) {
      setError("Select a fabric delivery destination before creating supplier emails.");
      return;
    }

    const pendingReplacements = liveOrder.fabric_lines.filter((line) => line.needs_replacement);
    if (pendingReplacements.length > 0) {
      setError(
        `Pick replacements for ${pendingReplacements.map((line) => line.fabric_number).join(", ")} before creating supplier emails.`
      );
      return;
    }

    setCreating(true);
    setError(null);
    try {
      if (!liveOrder.delivery_destination) {
        const saveRes = await fetch(`/api/sales-orders/${liveOrder.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delivery_destination: deliveryDestination }),
        });
        const saveData = await saveRes.json();
        if (!saveRes.ok) {
          throw new Error(saveData.error ?? "Failed to save delivery destination");
        }
      }

      const res = await fetch(`/api/sales-orders/${liveOrder.id}/fabric-pos`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create fabric orders");
      router.push(`/supplier-emails?sales_order_id=${liveOrder.id}`);
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

      {showFabricInput && (
        <DeliveryDestinationTabs
          value={deliveryDestination}
          onChange={handleDestinationChange}
          disabled={savingDestination}
        />
      )}

      {showFabricInput && canAppendFabricLines(liveOrder) && (
        <ProductionOrderAddFabrics
          order={liveOrder}
          productionMode={isClientManager}
          onOrderUpdated={setLiveOrder}
        />
      )}

      {showFabricOrdering && (
        <FabricOrderSubmitButton
          order={liveOrder}
          label={fabricLabels.submitButton}
          hint={fabricLabels.submitHint}
          submittedBadge={fabricLabels.submittedBadge}
        />
      )}

      {showProductionLabels && allStickers.length > 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Label sticker codes</h2>
              <p className="mt-1 text-sm text-slate-600">
                One unique code per garment piece — print QR stickers for the team to stick on fabric tags, then scan
                at receive, wash, iron, cutting, and sewing.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/orders/${order.id}/print-pack`}>
                <Button>Print packs (receiving + cutting)</Button>
              </Link>
              <Link href={`/orders/${order.id}/print?team=receiving`}>
                <Button variant="secondary">A4 receiving list</Button>
              </Link>
              <Link href={`/orders/${order.id}/stickers?sheet=fabric-cuts`}>
                <Button variant="secondary">Print fabric cuts (receive)</Button>
              </Link>
              <Link href={`/orders/${order.id}/print?team=production`}>
                <Button variant="secondary">A4 production list</Button>
              </Link>
              <Link href={`/orders/${order.id}/stickers?sheet=pieces`}>
                <Button variant="secondary">Production stickers</Button>
              </Link>
            </div>
          </div>
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
                    <td className="px-3 py-2 font-mono font-medium text-indigo-800" spellCheck={false}>
                      {sticker.code}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{liveOrder.client_name}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {formatLabelGarmentDescription(sticker.garment_type, sticker.piece_name)}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700">{sticker.fabric_number}</td>
                    <td className="px-3 py-2 text-slate-600">
                      <FabricSupplierName
                        supplierId={sticker.supplier_id}
                        supplierName={sticker.supplier_name}
                        fabricNumber={sticker.fabric_number}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{labels.fabricsSectionTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{labels.fabricsSectionDescription}</p>
            {fabricsEditable && (
              <p className="mt-1 text-xs text-slate-500">
                {isClientManager
                  ? "Edit fabric number, supplier, garment type, or meters on existing articles."
                  : "Edit fabric number, supplier, garment type, or meters on existing lines."}
              </p>
            )}
            {effectiveViewMode === "production" && (
              <p className="mt-1 text-xs text-slate-500">
                Edit fabrics on the Fabric Orders tab. Multi-piece garments (e.g. suit) show one line with multiple piece
                labels below.
              </p>
            )}
            {!fabricsEditable && fabricEditBlockedReason && (
              <p className="mt-1 text-xs text-amber-800">{fabricEditBlockedReason}</p>
            )}
            {liveOrder.fabric_lines.length > 0 && (
              <p className="mt-2 text-sm font-medium text-slate-800">
                Order total: {fabricTotals.total_meters.toFixed(1)} m
                {fabricTotals.total_kg != null ? ` · ${fabricTotals.total_kg.toFixed(1)} kg` : null}
              </p>
            )}
          </div>
          {!productionMode && <FabricPriceRevealToggle canViewFabricPrices={canViewFabricPrices} />}
        </div>
        <div className="mt-4 space-y-4">
          {Object.entries(supplierGroups).map(([groupKey, group]) => (
            <div key={groupKey} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">{group.name}</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                {group.lines.map((line) => (
                  <li
                    key={line.id}
                    className={`rounded border bg-white px-3 py-2 ${
                      line.needs_replacement || line.stock_status === "permanently_unavailable"
                        ? "border-amber-200 bg-amber-50/30"
                        : line.stock_status === "temp_unavailable"
                          ? "border-amber-100"
                          : "border-slate-200"
                    }`}
                  >
                    <p className="font-mono font-medium text-slate-900">
                      {line.fabric_number}
                      <FabricStockBadge fabric={line} />
                      <FabricReplacementBadge needsReplacement={line.needs_replacement} />
                      <span className="font-sans text-slate-600">
                        {" "}
                        — {line.quantity} {line.unit === "meters" ? "m" : line.unit}
                      </span>
                    </p>
                    {line.needs_replacement && (
                      <p className="mt-1 text-xs text-violet-800">Replacement still needed — update fabric before supplier emails.</p>
                    )}
                    {!line.needs_replacement && formatFabricStockLabel(line) && (
                      <p className="mt-1 text-xs text-amber-800">{formatFabricStockLabel(line)}</p>
                    )}
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[
                        line.garment_type,
                        formatFabricLineLabels(line),
                        line.composition,
                        line.weight_gsm != null ? `${line.weight_gsm} gsm` : null,
                        formatWidth(line),
                        canViewFabricPrices ? formatLinePrice(line) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {!canViewFabricPrices && (
                        <>
                          {" · "}
                          <MaskedFabricPrice />
                        </>
                      )}
                    </p>
                    {line.added_at && (
                      <p className="mt-1 text-xs text-slate-400">
                        Added {formatDateTime(line.added_at)}
                        {line.added_by ? ` by ${line.added_by}` : ""}
                      </p>
                    )}
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
                    {fabricsEditable && (
                      <div className="mt-3 flex flex-wrap items-start gap-2">
                        <OrderFabricLineEditor
                          orderId={liveOrder.id}
                          line={line}
                          productionMode={isClientManager}
                          onLineUpdated={handleLineUpdated}
                        />
                        <OrderFabricLineRemove
                          orderId={liveOrder.id}
                          line={line}
                          productionMode={isClientManager}
                          onLineRemoved={handleLineRemoved}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {showSupplierEmailActions &&
          !isClientManager &&
          (liveOrder.fabric_po_ids.length > 0 ? (
            <Link href={`/supplier-emails?sales_order_id=${liveOrder.id}`}>
              <Button>Send supplier emails</Button>
            </Link>
          ) : (
            <Button
              onClick={() => void createFabricPos()}
              disabled={creating || (!liveOrder.delivery_destination && !deliveryDestination)}
            >
              {creating ? "Creating…" : "Create fabric orders for suppliers"}
            </Button>
          ))}
        {showSupplierEmailActions && !isClientManager && (
          <Link href="/supplier-inbox">
            <Button variant="secondary">Supplier inbox</Button>
          </Link>
        )}
        {effectiveViewMode === "sales" && !isClientManager && (
          <CreateInvoiceButton
            salesOrderId={liveOrder.id}
            existingInvoiceId={existingInvoiceId}
            isReadyMade={isReadyMade}
          />
        )}
        {showFabricOrdering && (
          <Link href={`/orders/${order.id}`}>
            <Button variant="secondary">Open production order →</Button>
          </Link>
        )}
        {effectiveViewMode === "production" && (
          <Link href={`/fabric-orders/${order.id}`}>
            <Button variant="secondary">Edit fabrics on Fabric Orders →</Button>
          </Link>
        )}
        <Link
          href={
            effectiveViewMode === "fabric_order"
              ? `/fabric-orders/new?duplicate_from=${order.id}`
              : `/orders/new?duplicate_from=${order.id}`
          }
        >
          <Button variant="secondary">Duplicate for another client</Button>
        </Link>
        <Link href={effectiveViewMode === "fabric_order" ? "/fabric-orders/new?fresh=1" : "/orders/new"}>
          <Button variant="secondary">{labels.detailNewButton}</Button>
        </Link>
        {showProductionLabels && (
          <DownloadSalesOrderPdfButton orderId={order.id} soNumber={order.so_number} />
        )}
        {isAdmin && liveOrder.status === "open" && liveOrder.fabric_po_ids.length === 0 && (
          <DeleteSalesOrderButton order={liveOrder} />
        )}
      </div>

      {liveOrder.client_reference && (
        <p className="text-sm text-slate-500">
          Client reference: <span className="font-mono text-indigo-700">{liveOrder.client_reference}</span>
        </p>
      )}

      <Badge className="bg-slate-100 text-slate-700">Status: {liveOrder.status.replace(/_/g, " ")}</Badge>
    </div>
  );
}
