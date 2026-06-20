"use client";

import { Pencil, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MetersInput } from "@/components/orders/MetersInput";
import { DualCurrencyPrice } from "@/components/currency/DualCurrencyPrice";
import {
  FabricReplacementBadge,
  FabricStockBadge,
  lineNeedsAvailabilityAttention,
} from "@/components/fabric/FabricStockBadge";
import {
  GARMENT_STITCH_TYPES,
  getLabelCountForGarment,
  getMinLabelCountForGarment,
} from "@/lib/sales-orders/garment-types";
import { resolveFabricLineLabelCount } from "@/lib/sales-orders/label-display";
import type { SalesOrderLineDraft } from "@/lib/autosave/sales-order-draft";

type LineEditForm = {
  fabric_number: string;
  garment_type: string;
  label_count: string;
  meters: string;
};

function formatWidth(line: { width_cm?: number | null; width_inches?: number | null }) {
  if (line.width_cm != null) return `${line.width_cm} cm`;
  if (line.width_inches != null) return `${line.width_inches}"`;
  return "—";
}

function formatWeight(weight_gsm: number | null | undefined) {
  if (weight_gsm != null) return `${weight_gsm} gsm`;
  return "—";
}

export function SalesOrderFabricLineCards({
  groupName,
  lines,
  canViewFabricPrices,
  editingLineId,
  lineEditForm,
  savingLineEdit,
  onUpdateMeters,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
  onMarkFindReplacement,
  setLineEditForm,
}: {
  groupName: string;
  lines: SalesOrderLineDraft[];
  canViewFabricPrices: boolean;
  editingLineId: string | null;
  lineEditForm: LineEditForm | null;
  savingLineEdit: boolean;
  onUpdateMeters: (lineId: string, meters: string) => void;
  onStartEdit: (line: SalesOrderLineDraft) => void;
  onCancelEdit: () => void;
  onSaveEdit: (line: SalesOrderLineDraft) => void;
  onRemove: (lineId: string) => void;
  onMarkFindReplacement: (lineId: string) => void;
  setLineEditForm: React.Dispatch<React.SetStateAction<LineEditForm | null>>;
}) {
  return (
    <div className="space-y-3 md:hidden">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-900">{groupName}</h3>
      </div>

      {lines.map((line) => {
        const isEditing = editingLineId === line.lineId;

        if (isEditing && lineEditForm) {
          return (
            <div
              key={line.lineId}
              className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4"
            >
              <p className="text-sm font-medium text-slate-900">
                {line.needs_replacement ? "Pick replacement fabric" : "Edit fabric line"}
              </p>
              {line.needs_replacement ? (
                <p className="mt-1 text-xs text-violet-800">
                  Original {line.fabric_number} is unavailable — search for a substitute.
                </p>
              ) : null}
              <div className="mt-3 space-y-3">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Fabric number</span>
                  <input
                    value={lineEditForm.fabric_number}
                    onChange={(e) =>
                      setLineEditForm((prev) =>
                        prev ? { ...prev, fabric_number: e.target.value } : prev
                      )
                    }
                    className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base sm:text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Garment</span>
                  <select
                    value={lineEditForm.garment_type}
                    onChange={(e) => {
                      const next = e.target.value;
                      setLineEditForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              garment_type: next,
                              label_count: next
                                ? String(getLabelCountForGarment(next))
                                : prev.label_count,
                            }
                          : prev
                      );
                    }}
                    className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm"
                  >
                    <option value="">Select garment type…</option>
                    {GARMENT_STITCH_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">Labels</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={getMinLabelCountForGarment(lineEditForm.garment_type)}
                      step={1}
                      value={lineEditForm.label_count}
                      onChange={(e) =>
                        setLineEditForm((prev) =>
                          prev ? { ...prev, label_count: e.target.value } : prev
                        )
                      }
                      className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">Meters</span>
                    <MetersInput
                      value={lineEditForm.meters}
                      onChange={(next) =>
                        setLineEditForm((prev) => (prev ? { ...prev, meters: next } : prev))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm"
                    />
                  </label>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  size="sm"
                  className="min-h-[44px] w-full sm:w-auto"
                  onClick={() => onSaveEdit(line)}
                  disabled={savingLineEdit}
                >
                  {savingLineEdit ? "Saving…" : "Save line"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-[44px] w-full sm:w-auto"
                  onClick={onCancelEdit}
                  disabled={savingLineEdit}
                >
                  Cancel
                </Button>
              </div>
            </div>
          );
        }

        return (
          <div
            key={line.lineId}
            className={`rounded-lg border p-4 ${
              lineNeedsAvailabilityAttention(line)
                ? "border-amber-200 bg-amber-50/40"
                : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-base font-semibold text-slate-900">
                  {line.fabric_number}
                  <FabricStockBadge fabric={line} />
                  <FabricReplacementBadge needsReplacement={line.needs_replacement} />
                </p>
                {line.manual ? (
                  <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-sans font-medium uppercase tracking-wide text-amber-800">
                    Manual
                  </span>
                ) : null}
                <p className="mt-1 text-sm text-slate-600">{line.garment_type}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => onStartEdit(line)} title="Edit line">
                  <Pencil className="h-4 w-4 text-slate-400" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onRemove(line.lineId)} title="Remove line">
                  <Trash2 className="h-4 w-4 text-slate-400" />
                </Button>
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Labels</dt>
                <dd className="font-medium text-slate-800">{resolveFabricLineLabelCount(line)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Weight</dt>
                <dd className="text-slate-700">{formatWeight(line.weight_gsm)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-slate-500">Composition</dt>
                <dd className="text-slate-700">{line.composition ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Width</dt>
                <dd className="text-slate-700">{formatWidth(line)}</dd>
              </div>
              {canViewFabricPrices ? (
                <div>
                  <dt className="text-xs text-slate-500">Price</dt>
                  <dd className="text-slate-700">
                    <DualCurrencyPrice
                      amount={line.unit_price}
                      supplierId={line.supplier_id}
                      unit={line.unit}
                    />
                  </dd>
                </div>
              ) : null}
            </dl>

            <label className="mt-3 block text-sm">
              <span className="font-medium text-slate-700">Meters</span>
              <MetersInput
                value={line.meters}
                onChange={(next) => onUpdateMeters(line.lineId, next)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            {isFabricUnavailable(line.stock_status) ? (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3 min-h-[44px] w-full gap-1"
                onClick={() =>
                  line.needs_replacement ? onStartEdit(line) : onMarkFindReplacement(line.lineId)
                }
              >
                <Search className="h-3.5 w-3.5" />
                {line.needs_replacement ? "Pick replacement" : "Find replacement"}
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
