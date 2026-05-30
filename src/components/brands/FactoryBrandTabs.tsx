"use client";

import { getBrandClientCodePrefix } from "@/lib/clients/codes";
import { getFactoryBrands } from "@/lib/data/factory-brands";
import { cn } from "@/lib/utils";

const factoryBrands = getFactoryBrands();

export interface FactoryBrandTabsProps {
  value: string | null;
  onChange: (brandId: string | null) => void;
  /** Show an "All brands" tab (clients list). New sales orders usually omit this. */
  showAll?: boolean;
  allLabel?: string;
  className?: string;
  label?: string;
}

export function FactoryBrandTabs({
  value,
  onChange,
  showAll = false,
  allLabel = "All brands",
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
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              value === null ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {allLabel}
          </button>
        )}
        {factoryBrands.map((brand) => {
          const prefix = getBrandClientCodePrefix(brand.id);
          const active = value === brand.id;
          return (
            <button
              key={brand.id}
              type="button"
              onClick={() => onChange(brand.id)}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {brand.name}
              {prefix ? <span className={cn("ml-1.5 font-mono text-xs", active ? "text-indigo-100" : "text-slate-400")}>{prefix}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
