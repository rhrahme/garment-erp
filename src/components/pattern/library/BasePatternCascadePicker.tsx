"use client";

import { useMemo } from "react";
import { CUSTOM_PATTERN_ORIGIN } from "@/lib/pattern-library/derived-from";
import {
  cascadeSelectionReady,
  filterBases,
  garmentLabel,
  sheetHasLibraryBases,
  sheetsMissingLibraryBases,
  type BasePatternCascadeValue,
  uniqueBrandCodes,
  uniqueCutFamilies,
  uniqueCutVariants,
  uniqueGarmentTypes,
  withAutoResolvedBase,
} from "@/lib/pattern-library/base-pattern-picker";
import type { BasePattern } from "@/lib/types/pattern-library";
import { cn } from "@/lib/utils";

type BasePatternCascadePickerProps = {
  bases: BasePattern[];
  value: BasePatternCascadeValue;
  onChange: (next: BasePatternCascadeValue) => void;
  /** Extra garment types to offer even if no base exists yet (Custom sheets). */
  extraGarments?: string[];
  /** Lock origin to library (e.g. TUD fill “derive from”). */
  forceLibrary?: boolean;
  /** Show which sales garments still have no library base Excel/import. */
  showMissingLibraryHint?: boolean;
  className?: string;
};

function fieldClass(disabled?: boolean): string {
  return cn(
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm",
    disabled && "bg-slate-100 text-slate-400"
  );
}

export function BasePatternCascadePicker({
  bases,
  value,
  onChange,
  extraGarments = [],
  forceLibrary = false,
  showMissingLibraryHint = true,
  className,
}: BasePatternCascadePickerProps) {
  const garments = useMemo(
    () => uniqueGarmentTypes(bases, extraGarments),
    [bases, extraGarments]
  );

  const missingLibrarySheets = useMemo(() => sheetsMissingLibraryBases(bases), [bases]);

  const forGarment = useMemo(
    () =>
      value.garmentType
        ? filterBases(bases, { garmentType: value.garmentType })
        : [],
    [bases, value.garmentType]
  );

  const selectedSheetMissingLibrary =
    Boolean(value.garmentType) && !sheetHasLibraryBases(bases, value.garmentType);

  const brands = useMemo(() => uniqueBrandCodes(forGarment), [forGarment]);

  const forBrand = useMemo(
    () =>
      value.houseBrandCode
        ? filterBases(forGarment, { houseBrandCode: value.houseBrandCode })
        : [],
    [forGarment, value.houseBrandCode]
  );

  const families = useMemo(() => uniqueCutFamilies(forBrand), [forBrand]);

  const forFamily = useMemo(
    () =>
      value.cutFamily
        ? filterBases(forBrand, { cutFamily: value.cutFamily })
        : [],
    [forBrand, value.cutFamily]
  );

  const variants = useMemo(() => uniqueCutVariants(forFamily), [forFamily]);

  const forVariant = useMemo(
    () =>
      value.cutFamily
        ? filterBases(forFamily, { cutVariant: value.cutVariant })
        : [],
    [forFamily, value.cutFamily, value.cutVariant]
  );

  const selectedBase =
    forVariant.find((base) => base.id === value.basePatternId) ??
    (forVariant.length === 1 ? forVariant[0]! : null);

  function emit(partial: Partial<BasePatternCascadeValue>) {
    const next = withAutoResolvedBase(bases, { ...value, ...partial });
    onChange(next);
  }

  const libraryReady = forceLibrary || value.origin === "library";
  const showCascade = libraryReady && Boolean(value.garmentType);

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-600">Garment sheet</span>
        <select
          value={value.garmentType}
          onChange={(e) => {
            const garmentType = e.target.value;
            const nextBrands = uniqueBrandCodes(filterBases(bases, { garmentType }));
            emit({
              garmentType,
              houseBrandCode: nextBrands.includes(value.houseBrandCode)
                ? value.houseBrandCode
                : "",
              cutFamily: "",
              cutVariant: "",
              basePatternId: "",
              baseSize: "",
            });
          }}
          className={fieldClass()}
        >
          <option value="">Select garment…</option>
          {garments.map((garment) => (
            <option key={garment} value={garment}>
              {garmentLabel(garment)}
            </option>
          ))}
        </select>
      </label>

      {!forceLibrary ? (
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Origin</span>
          <select
            value={value.origin}
            onChange={(e) => {
              const origin = e.target.value as BasePatternCascadeValue["origin"];
              if (origin === "custom") {
                onChange({
                  ...value,
                  origin,
                  cutFamily: "",
                  cutVariant: "",
                  basePatternId: "",
                  baseSize: "",
                });
                return;
              }
              emit({ origin });
            }}
            disabled={!value.garmentType}
            className={fieldClass(!value.garmentType)}
          >
            <option value="custom">{CUSTOM_PATTERN_ORIGIN} — fill dimensions</option>
            <option value="library">Library base</option>
          </select>
        </label>
      ) : null}

      {showCascade ? (
        <>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">House brand</span>
            <select
              value={value.houseBrandCode}
              onChange={(e) =>
                emit({
                  houseBrandCode: e.target.value,
                  cutFamily: "",
                  cutVariant: "",
                  basePatternId: "",
                  baseSize: "",
                })
              }
              className={fieldClass()}
            >
              <option value="">Select brand…</option>
              {brands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Cut family</span>
            <select
              value={value.cutFamily}
              onChange={(e) =>
                emit({
                  cutFamily: e.target.value,
                  cutVariant: "",
                  basePatternId: "",
                  baseSize: "",
                })
              }
              disabled={!value.houseBrandCode}
              className={fieldClass(!value.houseBrandCode)}
            >
              <option value="">Select cut family…</option>
              {families.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
          </label>

          {variants.length > 1 || (variants.length === 1 && variants[0] !== "") ? (
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Cut variant</span>
              <select
                value={value.cutVariant}
                onChange={(e) =>
                  emit({
                    cutVariant: e.target.value,
                    basePatternId: "",
                    baseSize: "",
                  })
                }
                disabled={!value.cutFamily}
                className={fieldClass(!value.cutFamily)}
              >
                <option value="">
                  {variants.some((variant) => variant === "")
                    ? "Standard / none"
                    : "Select variant…"}
                </option>
                {variants
                  .filter((variant) => variant !== "")
                  .map((variant) => (
                    <option key={variant} value={variant}>
                      {variant}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}

          {forVariant.length > 1 ? (
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Base pattern</span>
              <select
                value={value.basePatternId}
                onChange={(e) => {
                  const base = forVariant.find((candidate) => candidate.id === e.target.value);
                  emit({
                    basePatternId: e.target.value,
                    baseSize: base?.sizes[0] ?? "",
                  });
                }}
                className={fieldClass()}
              >
                <option value="">Select base…</option>
                {forVariant.map((base) => (
                  <option key={base.id} value={base.id}>
                    {base.name}
                    {base.fabric ? ` · ${base.fabric}` : ""}
                    {base.style_code ? ` · ${base.style_code}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Size</span>
            <select
              value={value.baseSize}
              onChange={(e) => emit({ baseSize: e.target.value })}
              disabled={!selectedBase}
              className={fieldClass(!selectedBase)}
            >
              <option value="">Select size…</option>
              {(selectedBase?.sizes ?? []).map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      {value.origin === "custom" && value.garmentType ? (
        <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-3">
          Custom sheet — measurement template for {garmentLabel(value.garmentType)} will pre-fill;
          enter the client dimensions after create (and upload the .TUD on the pattern page).
        </p>
      ) : null}

      {selectedSheetMissingLibrary ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:col-span-2 lg:col-span-3">
          <p className="font-semibold">
            Library missing base patterns for {garmentLabel(value.garmentType)}
          </p>
          <p className="mt-1">
            Use <span className="font-medium">Custom</span> for now, or drop the measurement Excel
            (.xlsx) for this garment into your{" "}
            <span className="font-mono">Base Patterns</span> folder and tell me to import — then
            Library base will appear here.
          </p>
        </div>
      ) : null}

      {showMissingLibraryHint && missingLibrarySheets.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 sm:col-span-2 lg:col-span-3">
          <p className="font-medium text-slate-700">
            Library still missing bases for {missingLibrarySheets.length} garment
            {missingLibrarySheets.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 leading-relaxed">
            {missingLibrarySheets.join(" · ")}
          </p>
          <p className="mt-1 text-slate-500">
            Upload those base Excels when ready and ask to import.
          </p>
        </div>
      ) : null}

      {libraryReady &&
      value.garmentType &&
      !selectedSheetMissingLibrary &&
      !cascadeSelectionReady(value) ? (
        <p className="text-[11px] text-slate-400 sm:col-span-2 lg:col-span-3">
          Finish brand → cut → size to prefill from the library base.
        </p>
      ) : null}
    </div>
  );
}
