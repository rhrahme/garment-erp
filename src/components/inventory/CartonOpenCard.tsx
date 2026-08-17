"use client";

import { useState } from "react";
import type { InventoryCarton } from "@/lib/types/inventory";

function formatWhen(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CartonOpenCard({
  carton,
  itemName,
  itemBrand,
  unit,
  quantityOnHand,
}: {
  carton: InventoryCarton;
  itemName: string;
  itemBrand: string | null;
  unit: string;
  quantityOnHand: number;
}) {
  const [state, setState] = useState<{
    status: "idle" | "busy" | "done" | "already" | "error";
    balance: number;
    error?: string;
  }>({
    status: carton.status === "opened" ? "already" : "idle",
    balance: quantityOnHand,
  });

  const openBox = async () => {
    setState((prev) => ({ ...prev, status: "busy" }));
    try {
      const response = await fetch(
        `/api/inventory/cartons/${encodeURIComponent(carton.id)}/open`,
        { method: "POST" }
      );
      const data = (await response.json().catch(() => ({}))) as {
        opened?: boolean;
        item?: { quantity_on_hand?: number };
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Failed to open the box.");
      setState({
        status: data.opened ? "done" : "already",
        balance: data.item?.quantity_on_hand ?? quantityOnHand,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: error instanceof Error ? error.message : "Failed to open the box.",
      }));
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Inventory box</p>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">
        {itemName}
        {itemBrand ? <span className="text-slate-500"> ({itemBrand})</span> : null}
      </h1>
      <p className="mt-1 text-3xl font-bold text-slate-800">
        {carton.quantity} <span className="text-base font-medium text-slate-500">{unit}</span>
      </p>

      {state.status === "done" && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-800">
          <p className="text-lg font-semibold">Box opened</p>
          <p className="mt-1 text-sm">
            {carton.quantity} {unit} added. New stock: <strong>{state.balance}</strong> {unit}.
          </p>
        </div>
      )}
      {state.status === "already" && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-800">
          <p className="text-lg font-semibold">Already opened</p>
          <p className="mt-1 text-sm">
            This box was scanned before
            {carton.opened_by ? ` by ${carton.opened_by}` : ""} ({formatWhen(carton.opened_at)}).
            Stock was already added - do not add it twice.
          </p>
        </div>
      )}
      {state.status === "error" && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {(state.status === "idle" || state.status === "busy" || state.status === "error") && (
        <button
          type="button"
          disabled={state.status === "busy"}
          onClick={() => void openBox()}
          className="mt-6 w-full rounded-xl bg-indigo-600 px-4 py-4 text-lg font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {state.status === "busy" ? "Opening..." : "Start using this box"}
        </button>
      )}
      <p className="mt-4 text-xs text-slate-400">
        Tap once when you open the box - the {carton.quantity} {unit} inside are added to
        inventory stock.
      </p>
    </div>
  );
}
