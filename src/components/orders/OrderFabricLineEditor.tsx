"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FabricPicker } from "@/components/fabric/FabricPicker";
import { MetersInput } from "@/components/orders/MetersInput";
import { FabricStockBadge } from "@/components/fabric/FabricStockBadge";
import { fabricBrandAllowsManualEntry } from "@/lib/fabric-sourcing/supplier-display";
import { resolveFabricItem } from "@/lib/fabric-sourcing/resolve-fabric-item";
import { FactoryLabelsField } from "@/components/orders/FactoryLabelsField";
import { GARMENT_STITCH_TYPES } from "@/lib/sales-orders/garment-types";
import type { FabricSearchItem } from "@/lib/autosave/fabric-search-item";
import { parseDecimalInput } from "@/lib/utils/decimal-input";
import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";

type FabricBrand = { id: string; name: string; has_price_list?: boolean };

export function OrderFabricLineEditor({
  orderId,
  line,
  productionMode = false,
  onLineUpdated,
}: {
  orderId: string;
  line: SalesOrderFabricLine;
  productionMode?: boolean;
  onLineUpdated?: (line: SalesOrderFabricLine) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [fabricBrands, setFabricBrands] = useState<FabricBrand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState(line.supplier_id);
  const [fabricQuery, setFabricQuery] = useState(line.fabric_number);
  const [pendingFabric, setPendingFabric] = useState<FabricSearchItem | null>(null);
  const [garmentType, setGarmentType] = useState(line.garment_type);
  const [meters, setMeters] = useState(String(line.quantity));
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
    setSelectedBrandId(line.supplier_id);
    setFabricQuery(line.fabric_number);
    setPendingFabric(null);
    setGarmentType(line.garment_type);
    setMeters(String(line.quantity));
    setError(null);
  }

  function openEditor() {
    resetForm();
    setEditing(true);
  }

  function closeEditor() {
    setEditing(false);
    setError(null);
  }

  function selectFabric(item: FabricSearchItem) {
    setPendingFabric(item);
    setFabricQuery(item.fabric_number);
    setSelectedBrandId(item.supplier_id);
    setError(null);
  }

  const quantity = parseDecimalInput(meters);
  const formValid =
    Boolean(selectedBrandId && fabricQuery.trim()) &&
    Boolean(garmentType) &&
    Number.isFinite(quantity) &&
    quantity > 0;

  async function handleSave() {
    if (!garmentType) {
      setError("Select a garment type.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Enter valid meters.");
      return;
    }
    if (!fabricQuery.trim() || !selectedBrandId) {
      setError("Select a fabric first.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const fabric =
        pendingFabric ??
        (await resolveFabricItem(
          selectedBrandId,
          selectedBrand?.name ?? line.supplier_name,
          fabricQuery.trim()
        ));

      const res = await fetch(`/api/sales-orders/${orderId}/fabric-lines`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_id: line.id,
          garment_type: garmentType,
          supplier_id: fabric.supplier_id,
          supplier_name: fabric.supplier_name,
          fabric_number: fabric.fabric_number,
          quantity,
        }),
      });
      const data = (await res.json()) as { error?: string; updated_line?: SalesOrderFabricLine };
      if (!res.ok) throw new Error(data.error ?? "Failed to update fabric line.");

      if (data.updated_line) onLineUpdated?.(data.updated_line);
      closeEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update fabric line.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={openEditor}
      >
        <Pencil className="h-3.5 w-3.5" />
        {productionMode ? "Edit article" : "Edit line"}
      </Button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
      <p className="text-sm font-medium text-slate-900">
        {productionMode ? "Edit fabric article" : "Edit fabric line"}
      </p>
      {error && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-slate-700">Fabric brand</span>
          <select
            value={selectedBrandId}
            onChange={(e) => {
              setSelectedBrandId(e.target.value);
              setFabricQuery("");
              setPendingFabric(null);
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 md:max-w-sm"
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
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">Fabric number</span>
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
              label=""
              inputClassName="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono md:max-w-md"
            />
          </label>
        )}

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Garment to stitch</span>
          <select
            value={garmentType}
            onChange={(e) => setGarmentType(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            <option value="">Select garment…</option>
            {GARMENT_STITCH_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <FactoryLabelsField garmentType={garmentType} />

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Meters</span>
          <MetersInput
            value={meters}
            onChange={setMeters}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          />
        </label>
      </div>

      {pendingFabric && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <p className="font-mono font-medium text-slate-900">
            {pendingFabric.fabric_number}
            <FabricStockBadge fabric={pendingFabric} />
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void handleSave()} disabled={submitting || !formValid}>
          {submitting ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={closeEditor} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
