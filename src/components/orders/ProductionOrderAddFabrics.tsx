"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FabricPicker } from "@/components/fabric/FabricPicker";
import { FabricStockBadge } from "@/components/fabric/FabricStockBadge";
import { formatFabricStockLabel, isFabricUnavailable } from "@/lib/fabric-sourcing/fabric-stock";
import { fabricBrandAllowsManualEntry } from "@/lib/fabric-sourcing/supplier-display";
import { resolveFabricItem } from "@/lib/fabric-sourcing/resolve-fabric-item";
import { GARMENT_STITCH_TYPES, getLabelCountForGarment } from "@/lib/sales-orders/garment-types";
import type { FabricSearchItem } from "@/lib/autosave/fabric-search-item";
import { MetersInput } from "@/components/orders/MetersInput";
import { parseDecimalInput } from "@/lib/utils/decimal-input";

type FabricBrand = { id: string; name: string; has_price_list?: boolean };

export function ProductionOrderAddFabrics({
  order,
  productionMode = false,
  onOrderUpdated,
}: {
  order: SalesOrder;
  productionMode?: boolean;
  onOrderUpdated?: (order: SalesOrder) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fabricBrands, setFabricBrands] = useState<FabricBrand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [fabricQuery, setFabricQuery] = useState("");
  const [pendingFabric, setPendingFabric] = useState<FabricSearchItem | null>(null);
  const [garmentType, setGarmentType] = useState("");
  const [meters, setMeters] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedBrand = fabricBrands.find((brand) => brand.id === selectedBrandId) ?? null;

  useEffect(() => {
    async function loadBrands() {
      try {
        const res = await fetch("/api/fabric-brands");
        if (!res.ok) return;
        const data = (await res.json()) as { brands: FabricBrand[] };
        setFabricBrands(data.brands);
      } catch {
        /* ignore */
      }
    }
    void loadBrands();
  }, []);

  function resetForm() {
    setFabricQuery("");
    setPendingFabric(null);
    setGarmentType("");
    setMeters("");
    setError(null);
  }

  function selectFabric(item: FabricSearchItem) {
    setPendingFabric(item);
    setFabricQuery(item.fabric_number);
    setError(null);
  }

  const quantity = parseDecimalInput(meters);
  const formValid =
    Boolean(selectedBrand && fabricQuery.trim()) &&
    Boolean(garmentType) &&
    Number.isFinite(quantity) &&
    quantity > 0;

  async function handleSubmit() {
    if (!garmentType) {
      setError("Select a garment type.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Enter valid meters.");
      return;
    }
    if (!fabricQuery.trim() || !selectedBrand) {
      setError("Select a fabric first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fabric =
        pendingFabric ??
        (await resolveFabricItem(selectedBrandId, selectedBrand.name, fabricQuery.trim()));
      if (!pendingFabric) setPendingFabric(fabric);

      const res = await fetch(`/api/sales-orders/${order.id}/fabric-lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fabric_lines: [
            {
              garment_type: garmentType,
              supplier_id: fabric.supplier_id,
              supplier_name: fabric.supplier_name,
              fabric_number: fabric.fabric_number,
              quantity,
              unit: fabric.unit,
              unit_price: fabric.unit_price ?? 0,
              composition: fabric.composition,
              weight_gsm: fabric.weight_gsm,
              width_cm: fabric.width_cm,
              width_inches: fabric.width_inches,
              color: fabric.color,
              stock_status: fabric.stock_status ?? null,
              restock_date: fabric.restock_date ?? null,
              needs_replacement: fabric.stock_status === "permanently_unavailable",
            },
          ],
        }),
      });
      const data = (await res.json()) as { error?: string; order?: SalesOrder };
      if (!res.ok) throw new Error(data.error ?? "Failed to add fabric.");

      if (data.order) onOrderUpdated?.(data.order);

      resetForm();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add fabric.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {productionMode ? "Add fabric article" : "Add fabric line"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Add another fabric with garment type, factory labels, and meters — new sticker codes are generated
            automatically.
          </p>
        </div>
        {!open && (
          <Button type="button" onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {productionMode ? "Add article" : "Add fabric"}
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-5 space-y-4 rounded-lg border border-indigo-100 bg-white p-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
          )}

          <label className="block text-sm">
            <span className="font-medium text-slate-700">Fabric brand</span>
            <select
              value={selectedBrandId}
              onChange={(e) => {
                setSelectedBrandId(e.target.value);
                resetForm();
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 md:max-w-sm"
            >
              <option value="">Select fabric brand…</option>
              {fabricBrands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>

          {selectedBrandId && selectedBrand && (
            <>
              <FabricPicker
                brandName={selectedBrand.name}
                supplierId={selectedBrandId}
                value={fabricQuery}
                onChange={(next) => {
                  setFabricQuery(next);
                  setPendingFabric(null);
                }}
                onSelect={selectFabric}
                allowManualEntry={fabricBrandAllowsManualEntry(selectedBrand.has_price_list, selectedBrandId)}
                label="Fabric number"
                inputClassName="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono md:max-w-md"
              />

              {pendingFabric && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <p className="font-mono font-medium text-slate-900">
                    {pendingFabric.fabric_number}
                    <FabricStockBadge fabric={pendingFabric} />
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {[pendingFabric.composition, pendingFabric.weight_gsm != null ? `${pendingFabric.weight_gsm} gsm` : null]
                      .filter(Boolean)
                      .join(" · ") || selectedBrand.name}
                  </p>
                  {isFabricUnavailable(pendingFabric.stock_status) && (
                    <p className="mt-2 text-xs text-amber-800">
                      {formatFabricStockLabel(pendingFabric) ?? "Fabric availability issue"} — you can still add it.
                    </p>
                  )}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Garment to stitch</span>
                  <select
                    value={garmentType}
                    onChange={(e) => setGarmentType(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="">Select garment…</option>
                    {GARMENT_STITCH_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  {garmentType && (
                    <p className="mt-1 text-xs text-slate-500">
                      {getLabelCountForGarment(garmentType)} factory label
                      {getLabelCountForGarment(garmentType) === 1 ? "" : "s"} — auto from garment type
                    </p>
                  )}
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Meters</span>
                  <MetersInput
                    value={meters}
                    onChange={setMeters}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={submitting || !formValid}
                >
                  {submitting ? "Adding…" : productionMode ? "Add article to order" : "Add to order"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    resetForm();
                    setOpen(false);
                  }}
                  disabled={submitting}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
