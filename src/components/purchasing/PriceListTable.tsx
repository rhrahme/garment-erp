"use client";

import { useMemo, useState } from "react";
import { DataTable } from "@/components/ui/PageHeader";
import { DualCurrencyPrice } from "@/components/currency/DualCurrencyPrice";
import type { Supplier, SupplierFabric } from "@/lib/types/fabric-sourcing";

interface PriceListTableProps {
  suppliers: Supplier[];
  items: SupplierFabric[];
}

export function PriceListTable({ suppliers, items }: PriceListTableProps) {
  const [supplierId, setSupplierId] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let list = items;
    if (supplierId !== "all") list = list.filter((f) => f.supplier_id === supplierId);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (f) =>
          f.fabric_number.includes(q) ||
          f.color?.toLowerCase().includes(q) ||
          f.composition?.toLowerCase().includes(q) ||
          f.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, supplierId, query]);

  const display = filtered.slice(0, 100);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({items.filter((f) => f.supplier_id === s.id).length} prices)
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search fabric number, color, composition…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <span className="text-sm text-slate-500">
          {filtered.length.toLocaleString()} list prices
          {filtered.length > 100 ? " (showing first 100)" : ""}
        </span>
      </div>

      <DataTable
        columns={[
          { key: "supplier", label: "Supplier" },
          { key: "fabricNo", label: "Fabric No." },
          { key: "composition", label: "Composition" },
          { key: "color", label: "Color" },
          { key: "description", label: "Pattern" },
          { key: "specs", label: "Weight / Width" },
          { key: "price", label: "List price" },
        ]}
        rows={display.map((f) => ({
          supplier: f.supplier?.name ?? "—",
          fabricNo: <span className="font-mono font-medium">{f.fabric_number}</span>,
          composition: <span className="text-xs">{f.composition ?? "—"}</span>,
          color: f.color ?? "—",
          description: f.description ?? "—",
          specs: `${f.weight_gsm ?? "—"}gsm · ${f.width_cm ?? "—"}cm`,
          price:
            f.unit_price != null ? (
              <DualCurrencyPrice amount={f.unit_price} supplierId={f.supplier_id} unit={f.unit} />
            ) : (
              <span className="text-slate-400">Discontinued</span>
            ),
        }))}
        emptyMessage="No fabrics match your search."
      />
    </div>
  );
}
