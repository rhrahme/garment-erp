"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FabricStockBadge } from "@/components/fabric/FabricStockBadge";
import { formatFabricStockLabel, isFabricUnavailable } from "@/lib/fabric-sourcing/fabric-stock";
import { GARMENT_STITCH_TYPES, getLabelCountForGarment } from "@/lib/sales-orders/garment-types";
import type { FabricSearchItem } from "@/lib/autosave/fabric-search-item";
import type { SalesOrder } from "@/lib/types/sales-orders";

type FabricBrand = { id: string; name: string; has_price_list?: boolean };

export function ProductionOrderAddFabrics({
  order,
  productionMode = false,
}: {
  order: SalesOrder;
  productionMode?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fabricBrands, setFabricBrands] = useState<FabricBrand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [fabricQuery, setFabricQuery] = useState("");
  const [pendingFabric, setPendingFabric] = useState<FabricSearchItem | null>(null);
  const [garmentType, setGarmentType] = useState("");
  const [labelCount, setLabelCount] = useState("1");
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
    setLabelCount("1");
    setMeters("");
    setError(null);
  }

  async function resolveFabric(fabricNumber: string): Promise<FabricSearchItem> {
    const trimmed = fabricNumber.trim();
    const params = new URLSearchParams({
      supplier_id: selectedBrandId,
      q: trimmed,
      limit: "20",
    });
    const res = await fetch(`/api/fabric-search?${params}`);
    if (res.ok) {
      const data = (await res.json()) as { items: FabricSearchItem[] };
      const match =
        data.items.find(
          (item) => !item.manual && item.fabric_number.toLowerCase() === trimmed.toLowerCase()
        ) ?? data.items[0];
      if (match) return match;
    }

    return {
      id: `manual-${selectedBrandId}-${trimmed.toLowerCase()}`,
      supplier_id: selectedBrandId,
      supplier_name: selectedBrand?.name ?? selectedBrandId,
      fabric_number: trimmed,
      composition: null,
      color: null,
      weight_gsm: null,
      width_cm: null,
      width_inches: null,
      unit_price: null,
      unit: "meters",
      manual: true,
    };
  }

  async function handleFabricEnter() {
    if (!selectedBrandId || !fabricQuery.trim()) return;
    setError(null);
    try {
      const item = await resolveFabric(fabricQuery.trim());
      setPendingFabric(item);
      setFabricQuery(item.fabric_number);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to look up fabric.");
    }
  }

  async function handleSubmit() {
    if (!pendingFabric) {
      setError("Select a fabric first.");
      return;
    }
    if (!garmentType) {
      setError("Select a garment type.");
      return;
    }
    const quantity = Number(meters);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Enter valid meters.");
      return;
    }
    const labels = Number(labelCount);
    if (!Number.isInteger(labels) || labels < 1) {
      setError("Enter a valid label count.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${order.id}/fabric-lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fabric_lines: [
            {
              garment_type: garmentType,
              label_count: labels,
              supplier_id: pendingFabric.supplier_id,
              supplier_name: pendingFabric.supplier_name,
              fabric_number: pendingFabric.fabric_number,
              quantity,
              unit: pendingFabric.unit,
              unit_price: pendingFabric.unit_price ?? 0,
              composition: pendingFabric.composition,
              weight_gsm: pendingFabric.weight_gsm,
              width_cm: pendingFabric.width_cm,
              width_inches: pendingFabric.width_inches,
              color: pendingFabric.color,
              stock_status: pendingFabric.stock_status ?? null,
              restock_date: pendingFabric.restock_date ?? null,
              needs_replacement: pendingFabric.stock_status === "permanently_unavailable",
            },
          ],
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to add fabric.");

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

          {selectedBrandId && (
            <>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Fabric number</span>
                <input
                  value={fabricQuery}
                  onChange={(e) => {
                    setFabricQuery(e.target.value);
                    setPendingFabric(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleFabricEnter();
                    }
                  }}
                  placeholder={`Type ${selectedBrand?.name ?? "fabric"} number and press Enter`}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono md:max-w-md"
                  autoComplete="off"
                />
              </label>

              {pendingFabric && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <p className="font-mono font-medium text-slate-900">
                    {pendingFabric.fabric_number}
                    <FabricStockBadge fabric={pendingFabric} />
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {[pendingFabric.composition, pendingFabric.weight_gsm != null ? `${pendingFabric.weight_gsm} gsm` : null]
                      .filter(Boolean)
                      .join(" · ") || selectedBrand?.name}
                  </p>
                  {isFabricUnavailable(pendingFabric.stock_status) && (
                    <p className="mt-2 text-xs text-amber-800">
                      {formatFabricStockLabel(pendingFabric) ?? "Fabric availability issue"} — you can still add it.
                    </p>
                  )}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Garment to stitch</span>
                  <select
                    value={garmentType}
                    onChange={(e) => {
                      const next = e.target.value;
                      setGarmentType(next);
                      if (next) setLabelCount(String(getLabelCountForGarment(next)));
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="">Select garment…</option>
                    {GARMENT_STITCH_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Factory labels</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={labelCount}
                    onChange={(e) => setLabelCount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Meters</span>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={meters}
                    onChange={(e) => setMeters(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    placeholder="e.g. 3.5"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={submitting || !pendingFabric || !garmentType || !meters}
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
