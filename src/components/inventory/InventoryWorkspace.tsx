"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EntityPhotos } from "@/components/entity-images/EntityPhotos";
import { InventoryBoxScanInput } from "@/components/inventory/InventoryBoxScanInput";
import {
  inventoryItemIsLow,
  type GarmentRecipe,
  type InventoryCarton,
  type InventoryItem,
  type InventoryLedgerEntry,
} from "@/lib/types/inventory";

const EMPTY_ITEM_FORM = {
  name: "",
  category: "",
  brand: "",
  unit: "pcs",
  threshold: "",
  location: "",
  notes: "",
};

const REASON_LABELS: Record<string, string> = {
  garment_packed: "Garment packed",
  manual_adjust: "Manual adjust",
  received: "Stock received",
  correction: "Correction",
  carton_opened: "Box opened (scan)",
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return { ok: response.ok, error: data.error };
}

export function InventoryWorkspace({
  initialItems,
  initialRecipes,
  initialLedger,
  initialCartons,
  garmentTypes,
}: {
  initialItems: InventoryItem[];
  initialRecipes: GarmentRecipe[];
  initialLedger: InventoryLedgerEntry[];
  initialCartons: InventoryCarton[];
  garmentTypes: string[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"boxes" | "stock" | "recipes">("boxes");
  const [items] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const itemName = useMemo(
    () => new Map(items.map((item) => [item.id, item.name])),
    [items]
  );
  const lowItems = items.filter(inventoryItemIsLow);

  // ---- brand filter (stock table only)
  const NO_BRAND = "__none__";
  const [brandFilter, setBrandFilter] = useState<string>("");
  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      const brand = item.brand?.trim();
      if (brand) set.add(brand);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [items]);
  const hasUnbranded = items.some((item) => !item.brand?.trim());
  const visibleItems = useMemo(() => {
    if (!brandFilter) return items;
    if (brandFilter === NO_BRAND) return items.filter((item) => !item.brand?.trim());
    return items.filter((item) => item.brand?.trim() === brandFilter);
  }, [items, brandFilter]);

  // ---- add / edit item form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM);

  // ---- adjust state per item
  const [adjust, setAdjust] = useState<Record<string, string>>({});

  // ---- carton registration
  const [cartonForm, setCartonForm] = useState({
    item_id: "",
    cartons: "",
    qty: "",
    boxQtys: [] as string[],
  });
  const sealedByItem = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const carton of initialCartons) {
      if (carton.status !== "sealed") continue;
      const entry = map.get(carton.item_id) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += carton.quantity;
      map.set(carton.item_id, entry);
    }
    return map;
  }, [initialCartons]);

  const submitCartons = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/inventory/cartons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: cartonForm.item_id,
          carton_count: Number(cartonForm.cartons),
          quantity_per_carton: Number(cartonForm.qty || cartonForm.boxQtys[0] || 0),
          quantities: cartonForm.boxQtys
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value > 0),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        cartons?: Array<{ id: string }>;
        error?: string;
      };
      if (!response.ok || !data.cartons) {
        throw new Error(data.error ?? "Failed to register cartons.");
      }
      setCartonForm({ item_id: "", cartons: "", qty: "", boxQtys: [] });
      window.open(
        `/inventory/cartons/print?ids=${encodeURIComponent(
          data.cartons.map((carton) => carton.id).join(",")
        )}`,
        "_blank"
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register cartons.");
    } finally {
      setBusy(false);
    }
  };

  // ---- recipe editor
  const [recipeGarment, setRecipeGarment] = useState("");
  const [recipeLines, setRecipeLines] = useState<Array<{ item_id: string; qty: string }>>([
    { item_id: "", qty: "1" },
  ]);

  const run = async (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const result = await action().catch((err) => ({
      ok: false,
      error: err instanceof Error ? err.message : "Request failed.",
    }));
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Request failed.");
      return false;
    }
    router.refresh();
    return true;
  };

  const beginEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setItemForm({
      name: item.name,
      category: item.category ?? "",
      brand: item.brand ?? "",
      unit: item.unit || "pcs",
      threshold: item.low_stock_threshold == null ? "" : String(item.low_stock_threshold),
      location: item.location ?? "",
      notes: item.notes ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setItemForm(EMPTY_ITEM_FORM);
  };

  const submitItem = () =>
    run(() =>
      postJson("/api/inventory/items", {
        ...(editingId ? { id: editingId } : {}),
        name: itemForm.name,
        category: itemForm.category || null,
        brand: itemForm.brand || null,
        unit: itemForm.unit || "pcs",
        low_stock_threshold: itemForm.threshold === "" ? null : Number(itemForm.threshold),
        location: itemForm.location || null,
        notes: itemForm.notes || null,
      })
    ).then((ok) => {
      if (ok) cancelEdit();
    });

  const submitAdjust = (itemId: string, sign: 1 | -1) => {
    const qty = Number(adjust[itemId] ?? "");
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Enter a quantity first.");
      return;
    }
    void run(() =>
      postJson(`/api/inventory/items/${encodeURIComponent(itemId)}/adjust`, {
        delta: sign * qty,
        reason: sign > 0 ? "received" : "manual_adjust",
      })
    ).then((ok) => {
      if (ok) setAdjust((prev) => ({ ...prev, [itemId]: "" }));
    });
  };

  const loadRecipe = (garment: string) => {
    setRecipeGarment(garment);
    const recipe = initialRecipes.find(
      (row) => row.garment_type.toLowerCase() === garment.toLowerCase()
    );
    setRecipeLines(
      recipe && recipe.lines.length > 0
        ? recipe.lines.map((line) => ({
            item_id: line.item_id,
            qty: String(line.quantity_per_garment),
          }))
        : [{ item_id: "", qty: "1" }]
    );
  };

  const submitRecipe = () =>
    run(() =>
      postJson("/api/inventory/recipes", {
        garment_type: recipeGarment,
        lines: recipeLines
          .filter((line) => line.item_id)
          .map((line) => ({ item_id: line.item_id, quantity_per_garment: Number(line.qty) || 0 })),
      })
    );

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "boxes" as const, label: "Boxes" },
            { id: "stock" as const, label: "Stock" },
            { id: "recipes" as const, label: "Recipes" },
          ]
        ).map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === entry.id
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "stock" ? (
      <>
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4 text-sm text-indigo-900">
        <p className="font-medium">Automatic deduction</p>
        <p className="mt-1 text-indigo-800">
          When an article is scanned <strong>Packed</strong> on the production floor, its garment
          recipe below is subtracted automatically (e.g. a Suit takes 1 suit hanger, a Shirt takes
          1 laundry hanger). One deduction per order line - a Suit set never takes two hangers.
          Negative red counts mean the shelf and the system disagree - do a correction.
        </p>
      </div>

      {lowItems.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">
          <span className="font-semibold">Low stock:</span>{" "}
          {lowItems.map((item) => `${item.name} (${item.quantity_on_hand} ${item.unit})`).join(", ")}
        </div>
      )}

      {/* ------------------------------------------------ stock table */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Stock on hand</h2>
          {(brands.length > 0 || hasUnbranded) && (
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400">Brand:</span>
              <button
                type="button"
                onClick={() => setBrandFilter("")}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  brandFilter === ""
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All
              </button>
              {brands.map((brand) => (
                <button
                  key={brand}
                  type="button"
                  onClick={() => setBrandFilter(brand)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    brandFilter === brand
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {brand}
                </button>
              ))}
              {hasUnbranded && (
                <button
                  type="button"
                  onClick={() => setBrandFilter(NO_BRAND)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    brandFilter === NO_BRAND
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  No brand
                </button>
              )}
            </div>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-2">Item</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">On hand</th>
              <th className="px-3 py-2">Alert at</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Receive / use</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {items.length === 0
                    ? "No items yet - add the first one below."
                    : "No items for this brand."}
                </td>
              </tr>
            )}
            {visibleItems.map((item) => {
              const low = inventoryItemIsLow(item);
              const negative = item.quantity_on_hand < 0;
              return (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-5 py-2 font-medium text-slate-800">
                    {item.name}
                    {item.notes?.trim() ? (
                      <span className="mt-0.5 block text-xs font-normal text-slate-500">
                        {item.notes}
                      </span>
                    ) : null}
                    {item.location?.trim() ? (
                      <span className="mt-0.5 block text-xs font-normal text-slate-500">
                        {item.location}
                      </span>
                    ) : null}
                    <EntityPhotos
                      inventoryItemId={item.id}
                      compact
                      className="mt-1.5"
                    />
                  </td>
                  <td className="px-3 py-2 text-slate-500">{item.brand?.trim() || "-"}</td>
                  <td className="px-3 py-2 text-slate-500">{item.category ?? "-"}</td>
                  <td
                    className={`px-3 py-2 font-semibold ${
                      negative ? "text-red-600" : low ? "text-amber-600" : "text-slate-800"
                    }`}
                  >
                    {item.quantity_on_hand} {item.unit}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {item.low_stock_threshold ?? "-"}
                  </td>
                  <td className="px-3 py-2">
                    {negative ? (
                      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                        Negative
                      </span>
                    ) : low ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                        Low
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                        OK
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        value={adjust[item.id] ?? ""}
                        onChange={(event) =>
                          setAdjust((prev) => ({ ...prev, [item.id]: event.target.value }))
                        }
                        placeholder="Qty"
                        className="w-16 rounded-md border border-slate-200 px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => submitAdjust(item.id, 1)}
                        className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        + In
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => submitAdjust(item.id, -1)}
                        className="rounded-md bg-slate-600 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        - Out
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => beginEdit(item)}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 px-5 py-3">
          <div>
            <label className="block text-xs text-slate-500">
              {editingId ? "Edit item" : "New item"}
            </label>
            <input
              value={itemForm.name}
              onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })}
              placeholder="e.g. Suit hanger"
              className="mt-0.5 w-44 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500">Brand</label>
            <input
              list="inventory-brands"
              value={itemForm.brand}
              onChange={(event) => setItemForm({ ...itemForm, brand: event.target.value })}
              placeholder="No brand"
              className="mt-0.5 w-32 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
            <datalist id="inventory-brands">
              {brands.map((brand) => (
                <option key={brand} value={brand} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs text-slate-500">Category</label>
            <input
              value={itemForm.category}
              onChange={(event) => setItemForm({ ...itemForm, category: event.target.value })}
              placeholder="Hangers"
              className="mt-0.5 w-32 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500">Unit</label>
            <input
              value={itemForm.unit}
              onChange={(event) => setItemForm({ ...itemForm, unit: event.target.value })}
              className="mt-0.5 w-20 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500">Alert at</label>
            <input
              type="number"
              min="0"
              value={itemForm.threshold}
              onChange={(event) => setItemForm({ ...itemForm, threshold: event.target.value })}
              placeholder="10"
              className="mt-0.5 w-20 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500">Location</label>
            <input
              value={itemForm.location}
              onChange={(event) => setItemForm({ ...itemForm, location: event.target.value })}
              placeholder="Store room"
              className="mt-0.5 w-32 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500">Notes</label>
            <input
              value={itemForm.notes}
              onChange={(event) => setItemForm({ ...itemForm, notes: event.target.value })}
              placeholder="Optional"
              className="mt-0.5 w-40 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={busy || !itemForm.name.trim()}
            onClick={() => void submitItem()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {editingId ? "Save item" : "Add item"}
          </button>
          {editingId ? (
            <button
              type="button"
              disabled={busy}
              onClick={cancelEdit}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </section>
      </>
      ) : null}

      {tab === "boxes" ? (
      <>
      <InventoryBoxScanInput />
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Add boxes and print QR</h2>
        </div>
        <div className="grid gap-4 px-5 py-4 lg:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">
              How many boxes arrived, then how many pieces are inside each box. Print one 4x6
              sticker per box. Sealed boxes are not stock until someone scans a sticker to open
              one.
            </p>
            <div className="mt-3 space-y-2">
              <div>
                <label className="block text-xs text-slate-500">Item</label>
                <select
                  value={cartonForm.item_id}
                  onChange={(event) =>
                    setCartonForm({ ...cartonForm, item_id: event.target.value })
                  }
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                >
                  <option value="">Select item...</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <div>
                  <label className="block text-xs text-slate-500">How many boxes</label>
                  <input
                    type="number"
                    min="1"
                    value={cartonForm.cartons}
                    onChange={(event) => {
                      const next = event.target.value;
                      const count = Math.min(200, Math.max(0, Math.floor(Number(next) || 0));
                      const fill = cartonForm.qty;
                      setCartonForm({
                        ...cartonForm,
                        cartons: next,
                        boxQtys: Array.from(
                          { length: count },
                          (_, index) => cartonForm.boxQtys[index] || fill
                        ),
                      });
                    }}
                    placeholder="e.g. 10"
                    className="mt-0.5 w-28 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500">Inside each box</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={cartonForm.qty}
                    onChange={(event) => {
                      const next = event.target.value;
                      setCartonForm({
                        ...cartonForm,
                        qty: next,
                        boxQtys: cartonForm.boxQtys.map((value) => value || next),
                      });
                    }}
                    placeholder="e.g. 200"
                    className="mt-0.5 w-28 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="button"
                  disabled={
                    busy ||
                    !cartonForm.item_id ||
                    cartonForm.boxQtys.every((value) => !Number(value))
                  }
                  onClick={() => void submitCartons()}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Add boxes + print QR
                </button>
              </div>
              {cartonForm.boxQtys.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {cartonForm.boxQtys.map((value, index) => (
                    <label key={index} className="block text-xs text-slate-500">
                      Box {index + 1} inside
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={value}
                        onChange={(event) =>
                          setCartonForm({
                            ...cartonForm,
                            boxQtys: cartonForm.boxQtys.map((row, rowIndex) =>
                              rowIndex === index ? event.target.value : row
                            ),
                          })
                        }
                        className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Sealed boxes (not yet in stock)
            </p>
            {sealedByItem.size === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No sealed boxes.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {[...sealedByItem.entries()].map(([itemId, info]) => {
                  const item = items.find((row) => row.id === itemId);
                  return (
                    <li
                      key={itemId}
                      className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
                    >
                      <span className="text-slate-700">
                        <span className="font-medium">{item?.name ?? itemId}</span>{" "}
                        <span className="text-slate-500">
                          - {info.count} box{info.count === 1 ? "" : "es"}, {info.total}{" "}
                          {item?.unit ?? "pcs"} total
                        </span>
                      </span>
                      <a
                        href={`/inventory/cartons/print?item=${encodeURIComponent(itemId)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        Reprint QR
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
            {initialCartons.length > 0 ? (
              <ul className="mt-4 max-h-72 space-y-1.5 overflow-auto">
                {[...initialCartons]
                  .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                  .slice(0, 40)
                  .map((carton) => {
                    const item = items.find((row) => row.id === carton.item_id);
                    return (
                      <li
                        key={carton.id}
                        className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs"
                      >
                        <span className="text-slate-700">
                          <span className="font-medium">{item?.name ?? carton.item_id}</span>
                          {" · "}
                          {carton.quantity} {item?.unit ?? "pcs"}
                          {" · "}
                          {carton.status === "sealed" ? "Sealed" : "Opened"}
                        </span>
                        <a
                          href={`/inventory/cartons/print?ids=${encodeURIComponent(carton.id)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          QR
                        </a>
                      </li>
                    );
                  })}
              </ul>
            ) : null}
          </div>
        </div>
      </section>
      </>
      ) : null}

      {tab === "recipes" ? (
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-800">
            Garment recipes - what one garment consumes when packed
          </h2>
        </div>
        <div className="grid gap-4 px-5 py-4 lg:grid-cols-2">
          <div>
            {initialRecipes.length === 0 ? (
              <p className="text-sm text-slate-400">No recipes yet.</p>
            ) : (
              <ul className="space-y-2">
                {initialRecipes.map((recipe) => (
                  <li
                    key={recipe.garment_type}
                    className="flex items-start justify-between rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{recipe.garment_type}</p>
                      <p className="text-xs text-slate-500">
                        {recipe.lines
                          .map(
                            (line) =>
                              `${line.quantity_per_garment} x ${itemName.get(line.item_id) ?? "?"}`
                          )
                          .join(", ")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadRecipe(recipe.garment_type)}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      Edit
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <label className="block text-xs text-slate-500">Garment type</label>
            <input
              list="inventory-garment-types"
              value={recipeGarment}
              onChange={(event) => setRecipeGarment(event.target.value)}
              placeholder="e.g. Suit"
              className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
            <datalist id="inventory-garment-types">
              {garmentTypes.map((garment) => (
                <option key={garment} value={garment} />
              ))}
            </datalist>
            <div className="mt-2 space-y-1.5">
              {recipeLines.map((line, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <select
                    value={line.item_id}
                    onChange={(event) =>
                      setRecipeLines((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, item_id: event.target.value } : row
                        )
                      )
                    }
                    className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  >
                    <option value="">Select item...</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={line.qty}
                    onChange={(event) =>
                      setRecipeLines((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, qty: event.target.value } : row
                        )
                      )
                    }
                    className="w-16 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setRecipeLines((prev) =>
                        prev.length > 1 ? prev.filter((_, i) => i !== index) : prev
                      )
                    }
                    className="text-slate-400 hover:text-red-500"
                    aria-label="Remove line"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRecipeLines((prev) => [...prev, { item_id: "", qty: "1" }])}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                + Add line
              </button>
              <button
                type="button"
                disabled={busy || !recipeGarment.trim()}
                onClick={() => void submitRecipe()}
                className="ml-auto rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Save recipe
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Save with no lines to remove a recipe. Compound garments count once per order line
              (Suit = jacket + trouser = one recipe).
            </p>
          </div>
        </div>
      </section>
      ) : null}

      {tab !== "recipes" ? (
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Recent movements</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-2">When</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Change</th>
              <th className="px-3 py-2">Balance</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Order</th>
            </tr>
          </thead>
          <tbody>
            {initialLedger.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  No movements yet.
                </td>
              </tr>
            )}
            {initialLedger.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-100">
                <td className="px-5 py-2 text-slate-500">{formatWhen(entry.created_at)}</td>
                <td className="px-3 py-2 font-medium text-slate-800">
                  {itemName.get(entry.item_id) ?? entry.item_id}
                </td>
                <td
                  className={`px-3 py-2 font-semibold ${
                    entry.delta < 0 ? "text-red-600" : "text-emerald-600"
                  }`}
                >
                  {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                </td>
                <td className="px-3 py-2 text-slate-600">{entry.balance_after}</td>
                <td className="px-3 py-2 text-slate-500">
                  {REASON_LABELS[entry.reason] ?? entry.reason}
                  {entry.garment_type ? ` - ${entry.garment_type}` : ""}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {entry.so_number ?? "-"}
                  {entry.production_code ? ` (${entry.production_code})` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      ) : null}
    </div>
  );
}
