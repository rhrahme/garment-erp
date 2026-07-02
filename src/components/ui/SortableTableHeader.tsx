import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SortDirection } from "@/lib/sales-orders/fabric-line-sort";
import { cn } from "@/lib/utils";

export function SortableTableHeader({
  label,
  sortKey,
  activeSortKey,
  direction,
  onSort,
  className,
  align = "left",
}: {
  label: string;
  sortKey: string;
  activeSortKey: string | null;
  direction: SortDirection | null;
  onSort: (key: string) => void;
  className?: string;
  align?: "left" | "center" | "right";
}) {
  const active = activeSortKey === sortKey;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th
      className={cn(
        "px-3 py-2 select-none",
        align === "center" && "text-center",
        align === "right" && "text-right",
        className
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 rounded px-0.5 -mx-0.5 transition-colors hover:text-slate-800",
          active ? "text-slate-900" : "text-slate-500"
        )}
      >
        <span>{label}</span>
        <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-indigo-600" : "text-slate-400")} />
      </button>
    </th>
  );
}
