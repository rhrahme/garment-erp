"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LabelPrinterSettingsControl } from "@/components/orders/LabelRotationControl";
import { StickerCell } from "@/components/orders/StickerCell";
import { useLabelRotation } from "@/hooks/useLabelRotation";
import { useLabelScale } from "@/hooks/useLabelScale";
import type { StickerPreviewItem } from "@/lib/production/sticker-print-selection";

type StickerPrintPreviewModalProps = {
  open: boolean;
  onClose: () => void;
  onPrint: (selectedCodes: string[]) => void;
  items: StickerPreviewItem[];
  /** Defaults to all items when omitted; pass unprinted sticker codes for incremental print. */
  defaultSelectedCodes?: string[];
  title?: string;
  printing?: boolean;
};

function PreviewCard({
  item,
  checked,
  onToggle,
}: {
  item: StickerPreviewItem;
  checked: boolean;
  onToggle: (code: string, next: boolean) => void;
}) {
  const { label, role } = item;
  const code = label.sticker_code;

  return (
    <label
      className={`flex cursor-pointer flex-col rounded-xl border bg-white shadow-sm transition-colors ${
        checked ? "border-emerald-300 ring-1 ring-emerald-200" : "border-slate-200 opacity-60"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onToggle(code, event.target.checked)}
          className="h-4 w-4 shrink-0 rounded border-slate-300"
        />
        <div className="min-w-0 flex-1 text-xs">
          <p className="truncate font-mono font-semibold text-indigo-800">{code}</p>
          <p className="truncate text-slate-600">
            {label.client_code} · {label.fabric_brand} / {label.fabric_number}
          </p>
          <p className="truncate text-slate-500">
            {label.garment_type}
            {label.piece_name !== label.garment_type ? ` · ${label.piece_name}` : ""}
          </p>
        </div>
      </div>
      <div className="overflow-hidden p-2">
        <div
          className="pointer-events-none origin-top-left scale-[0.42]"
          style={{ width: "102mm", height: "51mm" }}
        >
          <StickerCell label={label} role={role} />
        </div>
      </div>
    </label>
  );
}

export function StickerPrintPreviewModal({
  open,
  onClose,
  onPrint,
  items,
  defaultSelectedCodes,
  title = "Print sticker preview",
  printing = false,
}: StickerPrintPreviewModalProps) {
  const allCodes = useMemo(() => items.map((item) => item.label.sticker_code), [items]);
  const initialSelection = useMemo(
    () => new Set(defaultSelectedCodes?.length ? defaultSelectedCodes : allCodes),
    [allCodes, defaultSelectedCodes]
  );
  const [selected, setSelected] = useState<Set<string>>(initialSelection);
  const { rotation, setRotation } = useLabelRotation();
  const { scalePct, setScalePct } = useLabelScale();

  useEffect(() => {
    if (open) setSelected(new Set(defaultSelectedCodes?.length ? defaultSelectedCodes : allCodes));
  }, [open, allCodes, defaultSelectedCodes]);

  const selectedCount = selected.size;
  const allSelected = selectedCount === items.length && items.length > 0;

  const toggleCode = useCallback((code: string, next: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(code);
      else copy.delete(code);
      return copy;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(allCodes));
  }, [allCodes, allSelected]);

  const handlePrint = useCallback(() => {
    onPrint([...selected]);
  }, [onPrint, selected]);

  if (!open) return null;

  return (
    <div
      className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sticker-print-preview-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="sticker-print-preview-title" className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Only unprinted stickers are selected by default. Uncheck any you do not want to print.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={printing}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <LabelPrinterSettingsControl
              rotation={rotation}
              onRotationChange={setRotation}
              scalePct={scalePct}
              onScalePctChange={setScalePct}
              compact
            />
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-slate-300"
              />
              Select all ({items.length})
            </label>
            <p className="text-sm text-slate-500">
              {selectedCount} of {items.length} selected
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <PreviewCard
                key={item.label.sticker_code}
                item={item}
                checked={selected.has(item.label.sticker_code)}
                onToggle={toggleCode}
              />
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Button variant="secondary" onClick={onClose} disabled={printing}>
            Cancel
          </Button>
          <Button onClick={handlePrint} disabled={printing || selectedCount === 0}>
            <Printer className="mr-2 h-4 w-4" />
            {printing ? "Preparing PDF…" : `Print selected (${selectedCount})`}
          </Button>
        </div>
      </div>
    </div>
  );
}
