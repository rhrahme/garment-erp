"use client";

import { getBrandClientCodePrefix } from "@/lib/clients/codes";
import { UNASSIGNED_FACTORY_BRAND_ID } from "@/lib/clients/filter";
import { getFactoryBrands, type FactoryBrand } from "@/lib/data/factory-brands";
import { cn } from "@/lib/utils";

const defaultFactoryBrands = getFactoryBrands();

export interface FactoryBrandTabsProps {
  value: string | null;
  onChange: (brandId: string | null) => void;
  /** Show an "All brands" tab (clients list). New sales orders usually omit this. */
  showAll?: boolean;
  allLabel?: string;
  /** Show clients with empty brand_ids under an Unassigned tab. */
  showUnassigned?: boolean;
  unassignedLabel?: string;
  /**
   * Brands to offer as tabs. Defaults to all active factory brands.
   * Pass a scoped list when sales users are limited to specific brands.
   */
  brands?: FactoryBrand[];
  className?: string;
  label?: string;
}

export function FactoryBrandTabs({
  value,
  onChange,
  showAll = false,
  allLabel = "All brands",
  showUnassigned = false,
  unassignedLabel = "Unassigned",
  brands = defaultFactoryBrands,
  className,
  label = "Production brand",
}: FactoryBrandTabsProps) {
  return (
    <div className={className}>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {showAll && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className={cn(
              "min-h-[44px] rounded-md px-3 py-2.5 text-sm font-medium transition-colors sm:min-h-0 sm:py-2",
              value === null ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {allLabel}
          </button>
        )}
        {brands.map((brand) => {
          const prefix = getBrandClientCodePrefix(brand.id);
          const active = value === brand.id;
          return (
            <button
              key={brand.id}
              type="button"
              onClick={() => onChange(brand.id)}
              className={cn(
                "min-h-[44px] rounded-md px-3 py-2.5 text-sm font-medium transition-colors sm:min-h-0 sm:py-2",
                active ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {brand.name}
              {prefix ? <span className={cn("ml-1.5 font-mono text-xs", active ? "text-indigo-100" : "text-slate-400")}>{prefix}</span> : null}
            </button>
          );
        })}
        {showUnassigned && (
          <button
            type="button"
            onClick={() => onChange(UNASSIGNED_FACTORY_BRAND_ID)}
            className={cn(
              "min-h-[44px] rounded-md px-3 py-2.5 text-sm font-medium transition-colors sm:min-h-0 sm:py-2",
              value === UNASSIGNED_FACTORY_BRAND_ID
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {unassignedLabel}
          </button>
        )}
      </div>
    </div>
  );
}
