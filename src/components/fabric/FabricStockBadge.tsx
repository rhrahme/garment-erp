import {
  fabricStockTone,
  formatFabricStockLabel,
  isFabricUnavailable,
} from "@/lib/fabric-sourcing/fabric-stock";
import type { FabricSearchItem } from "@/lib/autosave/fabric-search-item";

type StockFields = Pick<FabricSearchItem, "stock_status" | "restock_date">;

export function FabricStockBadge({ fabric }: { fabric: StockFields }) {
  const label = formatFabricStockLabel(fabric);
  if (!label) return null;

  const tone = fabricStockTone(fabric.stock_status);
  const className =
    tone === "warn"
      ? "bg-amber-100 text-amber-900"
      : tone === "danger"
        ? "bg-red-100 text-red-800"
        : "bg-slate-100 text-slate-700";

  return (
    <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-sans font-medium uppercase tracking-wide ${className}`}>
      {label}
    </span>
  );
}

export function FabricReplacementBadge({ needsReplacement }: { needsReplacement?: boolean }) {
  if (!needsReplacement) return null;
  return (
    <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-sans font-medium uppercase tracking-wide text-violet-800">
      Find replacement
    </span>
  );
}

export function lineNeedsAvailabilityAttention(line: StockFields & { needs_replacement?: boolean }): boolean {
  return isFabricUnavailable(line.stock_status) || Boolean(line.needs_replacement);
}
