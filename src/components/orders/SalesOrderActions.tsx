"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { DownloadSalesOrderPdfButton } from "@/components/orders/DownloadSalesOrderPdfButton";
import { Badge } from "@/components/ui/Badge";
import { DeleteSalesOrderButton } from "@/components/orders/DeleteSalesOrderButton";
import { FabricPriceRevealToggle, MaskedFabricCost, MaskedFabricPrice } from "@/components/orders/FabricPriceRevealToggle";
import { CreateInvoiceButton } from "@/components/invoicing/CreateInvoiceButton";
import { DeliveryDestinationTabs } from "@/components/shipping/DeliveryDestinationTabs";
import { FabricReplacementBadge, FabricStockBadge } from "@/components/fabric/FabricStockBadge";
import { FabricSwatchProvider } from "@/components/fabric/FabricSwatchProvider";
import { FabricNumberWithSwatch } from "@/components/fabric/FabricSwatchPreview";
import { isFabricUnavailable, formatFabricStockLabel } from "@/lib/fabric-sourcing/fabric-stock";
import { FabricSupplierName } from "@/components/fabric/FabricSupplierName";
import { fabricSupplierGroupKey, formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";
import type { PatternSalesOrderMismatch } from "@/lib/sales-orders/pattern-so-mismatch";
import { formatFabricCostHint, formatFabricCostSummary, formatFabricLineSupplierPrice, getFabricCostSummary, type FabricCostSummary } from "@/lib/sales-orders/fabric-cost";
import { getFabricTotalsSummary } from "@/lib/sales-orders/fabric-weight";
import { FabricLineStickerPrintLinks } from "@/components/orders/FabricLineStickerPrintLinks";
import { ordersUiLabels } from "@/lib/orders/ui-labels";
import { ProductionOrderAddFabrics } from "@/components/orders/ProductionOrderAddFabrics";
import { OrderFabricLineEditor } from "@/components/orders/OrderFabricLineEditor";
import { OrderFabricLineRemove } from "@/components/orders/OrderFabricLineRemove";
import { canAppendFabricLines, canEditFabricLines, fabricLineEditBlockedReason } from "@/lib/sales-orders/fabric-lines-rules";
import {
  buildSoArticleMapFromFabricLines,
  formatFabricLineArticle,
  formatLabelGarmentDescription,
  lineArticleFromStickerCode,
} from "@/lib/sales-orders/label-codes";
import {
  buildSoFabricLineEmailStatus,
  salesOrderFabricLineAnchor,
  summarizeSoFabricLineEmailStatus,
  supplierEmailsHref,
} from "@/lib/sales-orders/line-cross-reference";
import { FabricLineSupplierEmailCell } from "@/components/orders/FabricLineSupplierEmailCell";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";
import { formatFabricLineLabels } from "@/lib/sales-orders/label-display";
import { FabricOrderSubmitButton } from "@/components/orders/FabricOrderSubmitButton";
import { fabricOrderUiLabels } from "@/lib/orders/fabric-order-ui-labels";
import { formatDateTime } from "@/lib/utils";
import { SortableTableHeader } from "@/components/ui/SortableTableHeader";
import {
  nextFabricLineSort,
  sortFabricLines,
  type FabricLineSortKey,
  type FabricLineSortState,
} from "@/lib/sales-orders/fabric-line-sort";

export type SalesOrderViewMode = "fabric_order" | "production" | "sales";

function formatWidth(line: SalesOrderFabricLine) {
  if (line.width_cm != null) return `${line.width_cm} cm`;
  if (line.width_inches != null) return `${line.width_inches}"`;
  return "—";
}

function formatLinePrice(line: SalesOrderFabricLine) {
  return formatFabricLineSupplierPrice(line);
}

function fabricLinesCostKey(lines: SalesOrderFabricLine[]): string {
  return JSON.stringify(
    lines.map((line) => [line.id, line.quantity, line.unit_price, line.fabric_number, line.supplier_id])
  );
}

export function SalesOrderActions({
  order,
  fabricPos = [],
  patternMismatch = null,
  patternJobsByLineId = {},
  existingInvoiceId = null,
  isReadyMade = false,
  canViewFabricPrices = false,
  showFabricPriceControls = false,
  fabricCostSummary = null,
  isClientManager = false,
  isTaskOperator = false,
  isSalesOperator = false,
  productionMode = false,
  viewMode = "sales",
}: {
  order: SalesOrder;
  fabricPos?: PurchaseOrder[];
  patternMismatch?: PatternSalesOrderMismatch | null;
  patternJobsByLineId?: Record<string, number>;
  existingInvoiceId?: string | null;
  isReadyMade?: boolean;
  canViewFabricPrices?: boolean;
  showFabricPriceControls?: boolean;
  fabricCostSummary?: FabricCostSummary | null;
  isClientManager?: boolean;
  isTaskOperator?: boolean;
  isSalesOperator?: boolean;
  productionMode?: boolean;
  viewMode?: SalesOrderViewMode;
}) {
  const effectiveViewMode: SalesOrderViewMode =
    viewMode !== "sales" ? viewMode : productionMode ? "production" : "sales";
  const fabricLabels = fabricOrderUiLabels(isClientManager);
  const labels =
    effectiveViewMode === "fabric_order" ? fabricLabels : ordersUiLabels(productionMode, isTaskOperator);
  const showFabricOrdering = effectiveViewMode === "fabric_order";
  const showSalesAdmin = effectiveViewMode === "sales";
  const showProductionLabels = effectiveViewMode === "production" || showSalesAdmin;
  const showFabricInput = (showFabricOrdering || showSalesAdmin) && !isTaskOperator;
  const showSupplierEmailActions = !isSalesOperator && (showFabricOrdering || showSalesAdmin);
  const showSupplierEmailColumn = !isSalesOperator && showFabricOrdering && fabricPos.length > 0;
  const showFabricStock = !isSalesOperator;
  const router = useRouter();
  const [liveOrder, setLiveOrder] = useState(order);
  const [creating, setCreating] = useState(false);
  const [savingDestination, setSavingDestination] = useState(false);
  const [deliveryDestination, setDeliveryDestination] = useState<DeliveryDestination | "">(
    liveOrder.delivery_destination ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lineSort, setLineSort] = useState<FabricLineSortState | null>(null);

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

  const swatchFabrics = useMemo(
    () =>
      liveOrder.fabric_lines.map((line) => ({
        supplier_id: line.supplier_id,
        fabric_number: line.fabric_number,
      })),
    [liveOrder.fabric_lines]
  );

  const articleByLineId = useMemo(
    () => buildSoArticleMapFromFabricLines(liveOrder.fabric_lines),
    [liveOrder.fabric_lines]
  );

  const sortedFabricLines = useMemo(
    () => sortFabricLines(liveOrder.fabric_lines, lineSort, articleByLineId),
    [liveOrder.fabric_lines, lineSort, articleByLineId]
  );

  const fabricLineEmailById = useMemo(() => {
    if (!showSupplierEmailColumn) return new Map<string, ReturnType<typeof buildSoFabricLineEmailStatus>>();
    return new Map(
      liveOrder.fabric_lines.map((line) => [line.id, buildSoFabricLineEmailStatus(line, fabricPos)])
    );
  }, [liveOrder.fabric_lines, fabricPos, showSupplierEmailColumn]);

  const fabricLineEmailSummary = useMemo(
    () => (showSupplierEmailColumn ? summarizeSoFabricLineEmailStatus(liveOrder.fabric_lines, fabricPos) : null),
    [liveOrder.fabric_lines, fabricPos, showSupplierEmailColumn]
  );

  const supplierEmailsLink = supplierEmailsHref(liveOrder.id);
  const hasPartialSupplierEmails =
    fabricLineEmailSummary != null &&
    fabricLineEmailSummary.sent > 0 &&
    fabricLineEmailSummary.pending > 0;
  const allSupplierEmailsSent =
    fabricLineEmailSummary != null &&
    fabricLineEmailSummary.pending === 0 &&
    fabricLineEmailSummary.sent > 0;

  const handleLineSort = useCallback((key: string) => {
    setLineSort((prev) => nextFabricLineSort(prev, key as FabricLineSortKey));
  }, []);

  const fabricTotals = getFabricTotalsSummary(liveOrder.fabric_lines);
  const serverFabricCostKey = useMemo(() => fabricLinesCostKey(order.fabric_lines), [order.fabric_lines]);
  const liveFabricCostKey = useMemo(() => fabricLinesCostKey(liveOrder.fabric_lines), [liveOrder.fabric_lines]);
  const showFabricPricesColumn = showFabricPriceControls && showSalesAdmin;
  const fabricCost = canViewFabricPrices
    ? liveFabricCostKey === serverFabricCostKey && fabricCostSummary
      ? fabricCostSummary
      : getFabricCostSummary(liveOrder.fabric_lines)
    : null;
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
    <FabricSwatchProvider fabrics={swatchFabrics}>
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
                  <th className="px-3 py-2 text-center">Art.</th>
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
                    <td className="px-3 py-2 text-center font-semibold text-slate-900">
                      {formatFabricLineArticle(lineArticleFromStickerCode(sticker.code))}
                    </td>
                    <td className="px-3 py-2 font-mono font-medium text-indigo-800" spellCheck={false}>
                      {sticker.code}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{liveOrder.client_name}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {formatLabelGarmentDescription(sticker.garment_type, sticker.piece_name)}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      <FabricNumberWithSwatch
                        supplierId={sticker.supplier_id}
                        fabricNumber={sticker.fabric_number}
                        numberClassName="text-sm text-slate-700"
                      />
                    </td>
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
            {effectiveViewMode === "production" && !isTaskOperator && (
              <p className="mt-1 text-xs text-slate-500">
                Edit fabrics on the Fabric Orders tab. Multi-piece garments (e.g. suit) show one line with multiple piece
                labels below.
              </p>
            )}
            {effectiveViewMode === "production" && isTaskOperator && (
              <p className="mt-1 text-xs text-slate-500">
                View fabrics and use the print buttons above for A4 sheets and sticker rolls.
              </p>
            )}
            {!fabricsEditable && fabricEditBlockedReason && (
              <p className="mt-1 text-xs text-amber-800">{fabricEditBlockedReason}</p>
            )}
            {showSupplierEmailColumn && fabricLineEmailSummary && (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                  hasPartialSupplierEmails
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : allSupplierEmailsSent
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                {hasPartialSupplierEmails ? (
                  <p>
                    <span className="font-medium">
                      {fabricLineEmailSummary.sent} of{" "}
                      {fabricLineEmailSummary.sent + fabricLineEmailSummary.pending} fabric lines emailed
                    </span>
                    {" — "}
                    {fabricLineEmailSummary.pending} still pending.{" "}
                    <Link href={supplierEmailsLink} className="font-medium text-indigo-700 underline">
                      Send remaining in Supplier Emails
                    </Link>
                  </p>
                ) : allSupplierEmailsSent ? (
                  <p>
                    <span className="font-medium">All fabric lines emailed to suppliers.</span>{" "}
                    <Link href={supplierEmailsLink} className="font-medium text-indigo-700 underline">
                      View in Supplier Emails
                    </Link>
                  </p>
                ) : (
                  <p>
                    <span className="font-medium">{fabricLineEmailSummary.pending} fabric lines</span> ready for
                    supplier email.{" "}
                    <Link href={supplierEmailsLink} className="font-medium text-indigo-700 underline">
                      Open Supplier Emails
                    </Link>
                  </p>
                )}
              </div>
            )}
            {liveOrder.fabric_lines.length > 0 && (
              <div className="mt-2 space-y-1 text-sm font-medium text-slate-800">
                <p>
                  Order total: {fabricTotals.total_meters.toFixed(1)} m
                  {fabricTotals.total_kg != null ? ` · ${fabricTotals.total_kg.toFixed(1)} kg` : null}
                </p>
                {showFabricPricesColumn ? (
                  <p className="font-semibold text-emerald-900">
                    Fabric cost:{" "}
                    {canViewFabricPrices ? (
                      <>
                        {fabricCost ? formatFabricCostSummary(fabricCost) : "—"}
                        {fabricCost && formatFabricCostHint(fabricCost) ? (
                          <span className="ml-1 text-xs font-normal text-slate-500">
                            ({formatFabricCostHint(fabricCost)})
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <MaskedFabricCost />
                    )}
                  </p>
                ) : null}
              </div>
            )}
          </div>
          {showFabricPricesColumn && (
            <FabricPriceRevealToggle canViewFabricPrices={canViewFabricPrices} compact />
          )}
        </div>
        {liveOrder.fabric_lines.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <SortableTableHeader
                    label="Art."
                    sortKey="article"
                    activeSortKey={lineSort?.key ?? null}
                    direction={lineSort?.direction ?? null}
                    onSort={handleLineSort}
                    align="center"
                  />
                  <SortableTableHeader
                    label="Fabric"
                    sortKey="fabric"
                    activeSortKey={lineSort?.key ?? null}
                    direction={lineSort?.direction ?? null}
                    onSort={handleLineSort}
                  />
                  <SortableTableHeader
                    label="Garment"
                    sortKey="garment"
                    activeSortKey={lineSort?.key ?? null}
                    direction={lineSort?.direction ?? null}
                    onSort={handleLineSort}
                  />
                  <SortableTableHeader
                    label="Meters"
                    sortKey="meters"
                    activeSortKey={lineSort?.key ?? null}
                    direction={lineSort?.direction ?? null}
                    onSort={handleLineSort}
                  />
                  {showSupplierEmailColumn ? <th className="px-3 py-2">Supplier email</th> : null}
                  <th className="px-3 py-2">Sticker</th>
                  {effectiveViewMode === "production" ? <th className="px-3 py-2">Print</th> : null}
                </tr>
              </thead>
              <tbody>
                {sortedFabricLines.map((line) => (
                  <tr
                    key={line.id}
                    id={salesOrderFabricLineAnchor(line.id)}
                    className="scroll-mt-24 border-b border-slate-100 last:border-0"
                  >
                    <td className="px-3 py-2 text-center font-semibold text-slate-900">
                      {formatFabricLineArticle(articleByLineId.get(line.id))}
                    </td>
                    <td className="px-3 py-2 text-slate-900">
                      <FabricNumberWithSwatch
                        supplierId={line.supplier_id}
                        fabricNumber={line.fabric_number}
                        numberClassName="text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-600">{line.garment_type}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {line.quantity} {line.unit === "meters" ? "m" : line.unit}
                    </td>
                    {showSupplierEmailColumn ? (
                      <td className="px-3 py-2">
                        <FabricLineSupplierEmailCell status={fabricLineEmailById.get(line.id)} />
                      </td>
                    ) : null}
                    <td className="px-3 py-2 font-mono text-xs text-indigo-700">
                      {(line.label_stickers ?? [])[0]?.code ?? "—"}
                    </td>
                    {effectiveViewMode === "production" ? (
                      <td className="px-3 py-2">
                        <FabricLineStickerPrintLinks
                          orderId={order.id}
                          lineId={line.id}
                          garmentType={line.garment_type}
                          stickerCount={(line.label_stickers ?? []).length}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 space-y-4">
          {lineSort ? (
            <div className="overflow-x-auto rounded-lg border border-slate-100 bg-slate-50">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <SortableTableHeader
                      label="Art."
                      sortKey="article"
                      activeSortKey={lineSort.key}
                      direction={lineSort.direction}
                      onSort={handleLineSort}
                      align="center"
                    />
                    <SortableTableHeader
                      label="Supplier"
                      sortKey="supplier"
                      activeSortKey={lineSort.key}
                      direction={lineSort.direction}
                      onSort={handleLineSort}
                    />
                    <SortableTableHeader
                      label="Fabric"
                      sortKey="fabric"
                      activeSortKey={lineSort.key}
                      direction={lineSort.direction}
                      onSort={handleLineSort}
                    />
                    <SortableTableHeader
                      label="Garment"
                      sortKey="garment"
                      activeSortKey={lineSort.key}
                      direction={lineSort.direction}
                      onSort={handleLineSort}
                    />
                    <SortableTableHeader
                      label="Labels"
                      sortKey="labels"
                      activeSortKey={lineSort.key}
                      direction={lineSort.direction}
                      onSort={handleLineSort}
                    />
                    <SortableTableHeader
                      label="Composition"
                      sortKey="composition"
                      activeSortKey={lineSort.key}
                      direction={lineSort.direction}
                      onSort={handleLineSort}
                    />
                    <SortableTableHeader
                      label="Weight"
                      sortKey="weight"
                      activeSortKey={lineSort.key}
                      direction={lineSort.direction}
                      onSort={handleLineSort}
                    />
                    <SortableTableHeader
                      label="Width"
                      sortKey="width"
                      activeSortKey={lineSort.key}
                      direction={lineSort.direction}
                      onSort={handleLineSort}
                    />
                    <SortableTableHeader
                      label="Meters"
                      sortKey="meters"
                      activeSortKey={lineSort.key}
                      direction={lineSort.direction}
                      onSort={handleLineSort}
                    />
                    {showFabricPricesColumn ? (
                      <SortableTableHeader
                        label="Price"
                        sortKey="price"
                        activeSortKey={lineSort.key}
                        direction={lineSort.direction}
                        onSort={handleLineSort}
                      />
                    ) : null}
                    {showSupplierEmailColumn ? <th className="px-3 py-2">Supplier email</th> : null}
                    {fabricsEditable ? <th className="px-3 py-2 w-28" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {sortedFabricLines.map((line) => (
                    <tr
                      key={line.id}
                      id={salesOrderFabricLineAnchor(line.id)}
                      className={`scroll-mt-24 border-b border-slate-100 last:border-0 align-top ${
                        showFabricStock &&
                        (line.needs_replacement || line.stock_status === "permanently_unavailable")
                          ? "bg-amber-50/40"
                          : showFabricStock && line.stock_status === "temp_unavailable"
                            ? "bg-amber-50/20"
                            : "bg-white"
                      }`}
                    >
                      <td className="px-3 py-2 text-center font-semibold text-slate-900">
                        {formatFabricLineArticle(articleByLineId.get(line.id))}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        <FabricSupplierName
                          supplierId={line.supplier_id}
                          supplierName={line.supplier_name}
                          fabricNumber={line.fabric_number}
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-900">
                        <FabricNumberWithSwatch
                          supplierId={line.supplier_id}
                          fabricNumber={line.fabric_number}
                          highlight={
                            showFabricStock &&
                            (isFabricUnavailable(line.stock_status) || line.needs_replacement)
                          }
                        >
                          {showFabricStock ? <FabricStockBadge fabric={line} /> : null}
                          {showFabricStock ? (
                            <FabricReplacementBadge needsReplacement={line.needs_replacement} />
                          ) : null}
                        </FabricNumberWithSwatch>
                        {showFabricStock && line.needs_replacement && (
                          <p className="mt-1 text-xs text-violet-800">
                            Replacement still needed — update fabric before supplier emails.
                          </p>
                        )}
                        {showFabricStock && !line.needs_replacement && formatFabricStockLabel(line) && (
                          <p className="mt-1 text-xs text-amber-800">{formatFabricStockLabel(line)}</p>
                        )}
                        {line.added_at && (
                          <p className="mt-1 text-xs text-slate-400">
                            Added {formatDateTime(line.added_at)}
                            {line.added_by ? ` by ${line.added_by}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{line.garment_type}</td>
                      <td className="px-3 py-2 text-slate-600">{formatFabricLineLabels(line)}</td>
                      <td className="px-3 py-2 text-slate-600">{line.composition ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {line.weight_gsm != null ? `${line.weight_gsm} gsm` : "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{formatWidth(line)}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {line.quantity} {line.unit === "meters" ? "m" : line.unit}
                      </td>
                      {showFabricPricesColumn ? (
                        <td className="px-3 py-2 text-slate-600">
                          {canViewFabricPrices ? formatLinePrice(line) : <MaskedFabricPrice />}
                        </td>
                      ) : null}
                      {showSupplierEmailColumn ? (
                        <td className="px-3 py-2">
                          <FabricLineSupplierEmailCell status={fabricLineEmailById.get(line.id)} />
                        </td>
                      ) : null}
                      {fabricsEditable ? (
                        <td className="px-3 py-2">
                          <div className="flex flex-col items-end gap-2">
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
                              patternMismatch={patternMismatch}
                              patternJobsForLine={patternJobsByLineId[line.id] ?? 0}
                              onLineRemoved={handleLineRemoved}
                            />
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
          Object.entries(supplierGroups).map(([groupKey, group]) => (
            <div key={groupKey} className="overflow-x-auto rounded-lg border border-slate-100 bg-slate-50">
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
                <p className="font-medium text-slate-900">{group.name}</p>
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <SortableTableHeader
                      label="Art."
                      sortKey="article"
                      activeSortKey={lineSort?.key ?? null}
                      direction={lineSort?.direction ?? null}
                      onSort={handleLineSort}
                      align="center"
                    />
                    <SortableTableHeader
                      label="Fabric"
                      sortKey="fabric"
                      activeSortKey={lineSort?.key ?? null}
                      direction={lineSort?.direction ?? null}
                      onSort={handleLineSort}
                    />
                    <SortableTableHeader
                      label="Garment"
                      sortKey="garment"
                      activeSortKey={lineSort?.key ?? null}
                      direction={lineSort?.direction ?? null}
                      onSort={handleLineSort}
                    />
                    <SortableTableHeader
                      label="Labels"
                      sortKey="labels"
                      activeSortKey={lineSort?.key ?? null}
                      direction={lineSort?.direction ?? null}
                      onSort={handleLineSort}
                    />
                    <SortableTableHeader
                      label="Composition"
                      sortKey="composition"
                      activeSortKey={lineSort?.key ?? null}
                      direction={lineSort?.direction ?? null}
                      onSort={handleLineSort}
                    />
                    <SortableTableHeader
                      label="Weight"
                      sortKey="weight"
                      activeSortKey={lineSort?.key ?? null}
                      direction={lineSort?.direction ?? null}
                      onSort={handleLineSort}
                    />
                    <SortableTableHeader
                      label="Width"
                      sortKey="width"
                      activeSortKey={lineSort?.key ?? null}
                      direction={lineSort?.direction ?? null}
                      onSort={handleLineSort}
                    />
                    <SortableTableHeader
                      label="Meters"
                      sortKey="meters"
                      activeSortKey={lineSort?.key ?? null}
                      direction={lineSort?.direction ?? null}
                      onSort={handleLineSort}
                    />
                    {showFabricPricesColumn ? (
                      <SortableTableHeader
                        label="Price"
                        sortKey="price"
                        activeSortKey={lineSort?.key ?? null}
                        direction={lineSort?.direction ?? null}
                        onSort={handleLineSort}
                      />
                    ) : null}
                    {showSupplierEmailColumn ? <th className="px-3 py-2">Supplier email</th> : null}
                    {fabricsEditable ? <th className="px-3 py-2 w-28" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {group.lines.map((line) => (
                    <tr
                      key={line.id}
                      id={salesOrderFabricLineAnchor(line.id)}
                      className={`scroll-mt-24 border-b border-slate-100 last:border-0 align-top ${
                        showFabricStock &&
                        (line.needs_replacement || line.stock_status === "permanently_unavailable")
                          ? "bg-amber-50/40"
                          : showFabricStock && line.stock_status === "temp_unavailable"
                            ? "bg-amber-50/20"
                            : "bg-white"
                      }`}
                    >
                      <td className="px-3 py-2 text-center font-semibold text-slate-900">
                        {formatFabricLineArticle(articleByLineId.get(line.id))}
                      </td>
                      <td className="px-3 py-2 text-slate-900">
                        <FabricNumberWithSwatch
                          supplierId={line.supplier_id}
                          fabricNumber={line.fabric_number}
                          highlight={
                            showFabricStock &&
                            (isFabricUnavailable(line.stock_status) || line.needs_replacement)
                          }
                        >
                          {showFabricStock ? <FabricStockBadge fabric={line} /> : null}
                          {showFabricStock ? (
                            <FabricReplacementBadge needsReplacement={line.needs_replacement} />
                          ) : null}
                        </FabricNumberWithSwatch>
                        {showFabricStock && line.needs_replacement && (
                          <p className="mt-1 text-xs text-violet-800">
                            Replacement still needed — update fabric before supplier emails.
                          </p>
                        )}
                        {showFabricStock && !line.needs_replacement && formatFabricStockLabel(line) && (
                          <p className="mt-1 text-xs text-amber-800">{formatFabricStockLabel(line)}</p>
                        )}
                        {line.added_at && (
                          <p className="mt-1 text-xs text-slate-400">
                            Added {formatDateTime(line.added_at)}
                            {line.added_by ? ` by ${line.added_by}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{line.garment_type}</td>
                      <td className="px-3 py-2 text-slate-600">{formatFabricLineLabels(line)}</td>
                      <td className="px-3 py-2 text-slate-600">{line.composition ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {line.weight_gsm != null ? `${line.weight_gsm} gsm` : "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{formatWidth(line)}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {line.quantity} {line.unit === "meters" ? "m" : line.unit}
                      </td>
                      {showFabricPricesColumn ? (
                        <td className="px-3 py-2 text-slate-600">
                          {canViewFabricPrices ? formatLinePrice(line) : <MaskedFabricPrice />}
                        </td>
                      ) : null}
                      {showSupplierEmailColumn ? (
                        <td className="px-3 py-2">
                          <FabricLineSupplierEmailCell status={fabricLineEmailById.get(line.id)} />
                        </td>
                      ) : null}
                      {fabricsEditable ? (
                        <td className="px-3 py-2">
                          <div className="flex flex-col items-end gap-2">
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
                              patternMismatch={patternMismatch}
                              patternJobsForLine={patternJobsByLineId[line.id] ?? 0}
                              onLineRemoved={handleLineRemoved}
                            />
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              {group.lines.some((line) => (line.label_stickers ?? []).length > 0) && (
                <div className="border-t border-slate-200 bg-white px-3 py-2">
                  {group.lines.map((line) =>
                    (line.label_stickers ?? []).length > 0 ? (
                      <div key={`stickers-${line.id}`} className="py-1">
                        <p className="text-xs font-semibold text-slate-500">
                          {formatFabricLineArticle(articleByLineId.get(line.id))} stickers
                        </p>
                        <ul className="mt-1 space-y-1">
                          {line.label_stickers!.map((sticker) => (
                            <li key={sticker.code} className="font-mono text-xs text-indigo-700">
                              {sticker.code}
                              <span className="ml-2 font-sans text-slate-500">
                                {formatLabelGarmentDescription(line.garment_type, sticker.piece_name)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </div>
          ))
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {showSupplierEmailActions &&
          !isClientManager &&
          (liveOrder.fabric_po_ids.length > 0 ? (
            <Link href={supplierEmailsLink}>
              <Button variant={allSupplierEmailsSent ? "secondary" : undefined}>
                {hasPartialSupplierEmails
                  ? `Send remaining supplier emails (${fabricLineEmailSummary?.pending ?? 0})`
                  : allSupplierEmailsSent
                    ? "View supplier emails"
                    : "Send supplier emails"}
              </Button>
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
        {(effectiveViewMode === "sales" || isSalesOperator) && !isClientManager && (
          <CreateInvoiceButton
            salesOrderId={liveOrder.id}
            existingInvoiceId={existingInvoiceId}
            isReadyMade={isReadyMade}
          />
        )}
        {showFabricOrdering && !isSalesOperator && (
          <Link href={`/orders/${order.id}`}>
            <Button variant="secondary">Open production order →</Button>
          </Link>
        )}
        {effectiveViewMode === "production" && !isTaskOperator && (
          <Link href={`/fabric-orders/${order.id}`}>
            <Button variant="secondary">Edit fabrics on Fabric Orders →</Button>
          </Link>
        )}
        {!isTaskOperator && (
          <Link
            href={
              effectiveViewMode === "fabric_order" && !isSalesOperator
                ? `/fabric-orders/new?duplicate_from=${order.id}`
                : `/orders/new?duplicate_from=${order.id}`
            }
          >
            <Button variant="secondary">Duplicate for another client</Button>
          </Link>
        )}
        {!isTaskOperator && (
          <Link href={effectiveViewMode === "fabric_order" && !isSalesOperator ? "/fabric-orders/new?fresh=1" : "/orders/new"}>
            <Button variant="secondary">{labels.detailNewButton}</Button>
          </Link>
        )}
        {(showProductionLabels || effectiveViewMode === "fabric_order") && (
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
    </FabricSwatchProvider>
  );
}
