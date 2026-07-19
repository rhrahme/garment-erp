"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { DrapersFabricSwatch } from "@/components/fabric-specification/DrapersFabricSwatch";
import { DualCurrencyPrice } from "@/components/currency/DualCurrencyPrice";
import { formatFabricPatternLabel, formatFabricTextLabel } from "@/lib/fabric-sourcing/fabric-display";
import { fabricStockTone, formatFabricStockLabel } from "@/lib/fabric-sourcing/fabric-stock";
import { formatFabricSupplierName, isSolbiatiFabric } from "@/lib/fabric-sourcing/supplier-display";
import type { SupplierFabric } from "@/lib/types/fabric-sourcing";
import { cn } from "@/lib/utils";

interface FabricSpecPreviewProps {
  fabric: SupplierFabric;
  swatchSrc?: string;
  zoomSrc?: string;
  canViewPrices?: boolean;
  canViewStock?: boolean;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === "—" || children === "") return null;
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 border-b border-slate-100 py-2.5 last:border-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function FabricSpecDetailModal({
  fabric,
  canViewPrices,
  canViewStock,
  onClose,
}: {
  fabric: SupplierFabric;
  canViewPrices: boolean;
  canViewStock: boolean;
  onClose: () => void;
}) {
  const brand = formatFabricSupplierName(
    fabric.supplier_id,
    fabric.supplier?.name ?? fabric.supplier_id,
    fabric.fabric_number
  );
  const pattern = formatFabricPatternLabel(fabric);
  const text = formatFabricTextLabel(fabric);
  const finish = fabric.finish?.trim() || text;
  const stockLabel = canViewStock ? formatFabricStockLabel(fabric) : null;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Fabric ${fabric.fabric_number} details`}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white p-2 text-slate-800 shadow-lg hover:bg-slate-100"
        aria-label="Close fabric preview"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{brand}</p>
        <h3 className="mt-1 font-mono text-2xl font-semibold text-slate-900">{fabric.fabric_number}</h3>
        {pattern ? <p className="mt-1 text-sm font-medium text-slate-700">{pattern}</p> : null}

        <dl className="mt-4">
          {fabric.one_off || fabric.kind === "custom" ? (
            <DetailRow label="Supplier">
              {fabric.supplier_name?.trim() || "Custom / One-off"}
            </DetailRow>
          ) : null}
          <DetailRow label="Composition">{fabric.composition ?? "—"}</DetailRow>
          <DetailRow label="Collection">{pattern ?? "—"}</DetailRow>
          <DetailRow label="Color">{fabric.color ?? "—"}</DetailRow>
          <DetailRow label="Text">{text ?? "—"}</DetailRow>
          <DetailRow label="Finish">{finish ?? "—"}</DetailRow>
          <DetailRow label="Weight">
            {fabric.weight_gsm != null ? `${fabric.weight_gsm} gsm` : "—"}
          </DetailRow>
          <DetailRow label="Width">
            {fabric.width_cm != null ? `${fabric.width_cm} cm` : "—"}
          </DetailRow>
          <DetailRow label="HS Code">
            {fabric.gn_code ? <span className="font-mono text-xs">{fabric.gn_code}</span> : "—"}
          </DetailRow>
          <DetailRow label="Mill">{fabric.weave_type ?? "—"}</DetailRow>
          {canViewPrices ? (
            <DetailRow label="List price">
              {fabric.unit_price != null ? (
                <DualCurrencyPrice
                  amount={fabric.unit_price}
                  supplierId={fabric.supplier_id}
                  unit="m"
                  currency={fabric.currency}
                />
              ) : (
                "—"
              )}
            </DetailRow>
          ) : null}
          {stockLabel ? (
            <DetailRow label="Stock">
              <span
                className={cn(
                  fabricStockTone(fabric.stock_status) === "danger" && "font-medium text-red-700",
                  fabricStockTone(fabric.stock_status) === "warn" && "font-medium text-amber-800"
                )}
              >
                {stockLabel}
              </span>
            </DetailRow>
          ) : null}
          {fabric.description && fabric.description !== pattern ? (
            <DetailRow label="Notes">{fabric.description}</DetailRow>
          ) : null}
        </dl>

        <p className="mt-4 text-center text-xs text-slate-400">Press Esc or click outside to close</p>
      </div>
    </div>
  );
}

function FabricSpecPreviewTrigger({
  fabric,
  canViewPrices,
  canViewStock,
  variant,
}: {
  fabric: SupplierFabric;
  canViewPrices: boolean;
  canViewStock: boolean;
  variant: "eye" | "linen";
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const pattern = formatFabricPatternLabel(fabric);
  const hoverTitle = [fabric.fabric_number, fabric.composition, pattern].filter(Boolean).join(" · ");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={hoverTitle || `${fabric.fabric_number} — view fabric details`}
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center justify-center transition-colors",
          variant === "linen"
            ? "rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 hover:bg-amber-200"
            : "h-7 w-7 rounded border border-slate-200 bg-slate-50 text-slate-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
        )}
        aria-label={`Preview fabric ${fabric.fabric_number}`}
      >
        {variant === "linen" ? "Linen" : <Eye className="h-3.5 w-3.5" />}
      </button>

      {open ? (
        <FabricSpecDetailModal
          fabric={fabric}
          canViewPrices={canViewPrices}
          canViewStock={canViewStock}
          onClose={close}
        />
      ) : null}
    </>
  );
}

/** Preview cell — Drapers swatch image when available, otherwise click for full spec modal. */
export function FabricSpecPreview({
  fabric,
  swatchSrc,
  zoomSrc,
  canViewPrices = true,
  canViewStock = true,
}: FabricSpecPreviewProps) {
  if (swatchSrc) {
    return (
      <DrapersFabricSwatch
        fabricNumber={fabric.fabric_number}
        src={swatchSrc}
        zoomSrc={zoomSrc}
      />
    );
  }

  const variant = isSolbiatiFabric(fabric.supplier_id, fabric.fabric_number) ? "linen" : "eye";

  return (
    <FabricSpecPreviewTrigger
      fabric={fabric}
      canViewPrices={canViewPrices}
      canViewStock={canViewStock}
      variant={variant}
    />
  );
}
