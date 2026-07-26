"use client";

import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GARMENT_STITCH_TYPES } from "@/lib/sales-orders/garment-types";
import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";

type ChangeGarmentTypeControlProps = {
  salesOrderId: string;
  lineId: string;
  currentGarmentType: string;
  compact?: boolean;
  onChanged?: (next: { garment_type: string; label_stickers?: SalesOrderFabricLine["label_stickers"]; label_count?: number }) => void;
};

export function ChangeGarmentTypeControl({
  salesOrderId,
  lineId,
  currentGarmentType,
  compact = false,
  onChanged,
}: ChangeGarmentTypeControlProps) {
  const [open, setOpen] = useState(false);
  const [nextType, setNextType] = useState(currentGarmentType);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/garment-type-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sales_order_id: salesOrderId,
          line_id: lineId,
          garment_type: nextType,
          note: note.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to change garment type");
      const updatedLine = data.updated_line as SalesOrderFabricLine | undefined;
      setSuccess(`${currentGarmentType} → ${nextType}`);
      setOpen(false);
      onChanged?.({
        garment_type: updatedLine?.garment_type ?? nextType,
        label_stickers: updatedLine?.label_stickers,
        label_count: updatedLine?.label_count,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change garment type");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className={compact ? "" : "mt-2"}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={compact ? "h-8 text-xs" : "min-h-[36px]"}
          onClick={() => {
            setNextType(currentGarmentType);
            setNote("");
            setError(null);
            setSuccess(null);
            setOpen(true);
          }}
        >
          <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
          Change garment type
        </Button>
        {success ? <p className="mt-1 text-xs text-emerald-700">Updated: {success}</p> : null}
      </div>
    );
  }

  return (
    <div
      className={
        compact
          ? "mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3"
          : "mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4"
      }
    >
      <p className="text-sm font-medium text-slate-900">Change garment type</p>
      <p className="mt-1 text-xs text-slate-600">
        Current: <span className="font-medium">{currentGarmentType}</span>. Admin is notified and
        the change is logged on the dashboard.
      </p>
      <div className="mt-3 space-y-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">New garment type</span>
          <select
            value={nextType}
            onChange={(e) => setNextType(e.target.value)}
            className="mt-1 w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {GARMENT_STITCH_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why the type changed…"
            className="mt-1 w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void submit()} disabled={saving}>
          {saving ? "Saving…" : "Save change"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
