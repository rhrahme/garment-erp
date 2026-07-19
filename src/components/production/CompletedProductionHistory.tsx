"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Hash,
  Search,
  Store,
  Users,
  X,
} from "lucide-react";
import { FabricSupplierName } from "@/components/fabric/FabricSupplierName";
import { formatLabelGarmentDescription } from "@/lib/sales-orders/label-codes";
import {
  buildCompletedHistorySections,
  completedAccountLabel,
  defaultExpandedSectionKeys,
  filterCompletedOrdersByBespokeClient,
  filterCompletedOrdersByDay,
  filterCompletedOrdersByFactoryBrand,
  filterCompletedOrdersByReadyMadeBrand,
  formatCompletedDayLabel,
  isReadyMadeWorkOrder,
  listBespokeClientOptions,
  listFactoryBrandOptions,
  listReadyMadeBrandOptions,
  matchesCompletedSearch,
  type CompletedProductionView,
} from "@/lib/production/completed-history";
import type { ProductionWorkOrder } from "@/lib/types/production";
import { cn } from "@/lib/utils";

const VIEW_OPTIONS: {
  id: CompletedProductionView;
  label: string;
  hint: string;
  icon: typeof Users;
}[] = [
  { id: "by_client", label: "By client", hint: "Bespoke clients only", icon: Users },
  { id: "by_day", label: "Daily output", hint: "What finished each day", icon: CalendarDays },
  { id: "by_order", label: "By order", hint: "Group by sales order number", icon: Hash },
  { id: "by_ready_made", label: "Ready-made", hint: "Retail brands — Massimo Dutti, Lebanon Beirut, …", icon: Store },
  { id: "by_brand", label: "By brand", hint: "Factory brands — Fouad Rahme, Gliani, …", icon: Building2 },
];

type CompletedProductionHistoryProps = {
  orders: ProductionWorkOrder[];
  loading: boolean;
  totalCount: number;
};

export function CompletedProductionHistory({ orders, loading, totalCount }: CompletedProductionHistoryProps) {
  const [view, setView] = useState<CompletedProductionView>("by_day");
  const [search, setSearch] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const filterOptions = useMemo(() => {
    switch (view) {
      case "by_brand":
        return listFactoryBrandOptions(orders);
      case "by_ready_made":
        return listReadyMadeBrandOptions(orders);
      case "by_client":
        return listBespokeClientOptions(orders);
      default:
        return [];
    }
  }, [orders, view]);

  const filterConfig = useMemo(() => {
    switch (view) {
      case "by_brand":
        return { label: "Brand", placeholder: "All factory brands" };
      case "by_ready_made":
        return { label: "Retail brand", placeholder: "All ready-made brands" };
      case "by_client":
        return { label: "Client", placeholder: "All clients" };
      default:
        return null;
    }
  }, [view]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = orders;
    if (view === "by_day" && selectedDay) {
      result = filterCompletedOrdersByDay(result, selectedDay);
    }
    if (view === "by_brand" && selectedFilter) {
      result = filterCompletedOrdersByFactoryBrand(result, selectedFilter);
    }
    if (view === "by_ready_made" && selectedFilter) {
      result = filterCompletedOrdersByReadyMadeBrand(result, selectedFilter);
    }
    if (view === "by_client" && selectedFilter) {
      result = filterCompletedOrdersByBespokeClient(result, selectedFilter);
    }
    if (query) {
      result = result.filter((order) => matchesCompletedSearch(order, query));
    }
    return result;
  }, [orders, search, view, selectedDay, selectedFilter]);

  const sections = useMemo(
    () => buildCompletedHistorySections(filteredOrders, view),
    [filteredOrders, view]
  );

  useEffect(() => {
    setExpanded(defaultExpandedSectionKeys(sections));
  }, [view]);

  useEffect(() => {
    if (view !== "by_day") setSelectedDay("");
    setSelectedFilter("");
  }, [view]);

  useEffect(() => {
    if (selectedFilter && !filterOptions.includes(selectedFilter)) {
      setSelectedFilter("");
    }
  }, [filterOptions, selectedFilter]);

  useEffect(() => {
    setExpanded((current) => {
      const validKeys = new Set(sections.map((section) => section.key));
      const pruned = new Set([...current].filter((key) => validKeys.has(key)));
      return pruned.size > 0 ? pruned : defaultExpandedSectionKeys(sections);
    });
  }, [sections]);

  function toggleSection(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(sections.map((section) => section.key)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading production work orders…</p>;
  }

  if (totalCount === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
        No completed pieces yet — finished work will appear here for records and tracking.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-[200px] flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client, brand, order, sticker…"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {view === "by_day" && (
            <div className="flex items-center gap-2">
              <label htmlFor="completed-day-picker" className="shrink-0 text-sm font-medium text-slate-600">
                Day
              </label>
              <input
                id="completed-day-picker"
                type="date"
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {selectedDay && (
                <button
                  type="button"
                  onClick={() => setSelectedDay("")}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200"
                  title="Show all days"
                >
                  <X className="h-3.5 w-3.5" />
                  All days
                </button>
              )}
            </div>
          )}

          {filterConfig && filterOptions.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="completed-view-filter" className="shrink-0 text-sm font-medium text-slate-600">
                {filterConfig.label}
              </label>
              <select
                id="completed-view-filter"
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
                className="min-w-[180px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">{filterConfig.placeholder}</option>
                {filterOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {selectedFilter && (
                <button
                  type="button"
                  onClick={() => setSelectedFilter("")}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200"
                  title={`Show ${filterConfig.placeholder.toLowerCase()}`}
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {VIEW_OPTIONS.map((option) => {
            const active = view === option.id;
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                type="button"
                title={option.hint}
                onClick={() => setView(option.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {sections.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            {filteredOrders.length} piece{filteredOrders.length === 1 ? "" : "s"} in {sections.length} group
            {sections.length === 1 ? "" : "s"}
          </span>
          <div className="flex gap-3">
            <button type="button" onClick={expandAll} className="font-medium text-indigo-600 hover:text-indigo-800">
              Expand all
            </button>
            <button type="button" onClick={collapseAll} className="font-medium text-slate-600 hover:text-slate-900">
              Collapse all
            </button>
          </div>
        </div>
      )}

      {filteredOrders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          {view === "by_day" && selectedDay
            ? `Nothing completed on ${formatCompletedDayLabel(selectedDay)}.`
            : selectedFilter
              ? `No completed pieces for ${selectedFilter}.`
              : search.trim()
                ? `No matches for "${search.trim()}".`
                : view === "by_client"
                  ? "No bespoke client completions — ready-made retail is under Ready-made."
                  : view === "by_ready_made"
                    ? "No ready-made completions in this list."
                    : "No completed pieces match the current filters."}
        </p>
      ) : (
        <div className="space-y-3">
          {sections.map((section) => {
            const isOpen = expanded.has(section.key);
            return (
              <section key={section.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.key)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{section.label}</p>
                      <p className="text-xs text-slate-500">{section.meta}</p>
                    </div>
                  </button>
                  {view === "by_order" && section.clusters[0] && (
                    <Link
                      href={`/orders/${section.clusters[0].sales_order_id}`}
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      View order
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>

                {isOpen && section.clusters.length === 0 ? (
                  <p className="border-t border-slate-100 px-4 py-4 text-sm text-slate-500">
                    No completed pieces for {section.label} yet.
                  </p>
                ) : isOpen ? (
                  <div className="border-t border-slate-100 bg-slate-50/50">
                    {section.clusters.map((cluster) => {
                      const firstOrder = cluster.orders[0];
                      const accountLabel = firstOrder ? completedAccountLabel(firstOrder) : "";
                      const readyMade = firstOrder ? isReadyMadeWorkOrder(firstOrder) : false;

                      return (
                      <div key={cluster.sales_order_id} className="border-b border-slate-100 last:border-0">
                        {view !== "by_order" && (
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100/80 px-4 py-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{cluster.so_number}</p>
                            <p className="text-xs text-slate-500">
                              {readyMade ? "Ready-made" : "Client"}
                              <span className="mx-1.5 text-slate-300">·</span>
                              <span className="font-medium text-slate-700">{accountLabel || "—"}</span>
                              <span className="mx-1.5 text-slate-300">·</span>
                              {cluster.orders.length} piece{cluster.orders.length === 1 ? "" : "s"}
                            </p>
                          </div>
                          <Link
                            href={`/orders/${cluster.sales_order_id}`}
                            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            View order
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                        )}

                        <ul className="divide-y divide-slate-100">
                          {cluster.orders.map((order) => (
                            <li key={order.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                              <span className="font-mono text-xs font-semibold text-indigo-800">{order.sticker_code}</span>
                              <span className="text-slate-700">
                                {formatLabelGarmentDescription(order.garment_type, order.piece_name)}
                              </span>
                              <span className="text-xs text-slate-500">
                                <FabricSupplierName
                                  supplierId={order.supplier_id}
                                  supplierName={order.supplier_name}
                                  fabricNumber={order.fabric_number}
                                />{" "}
                                {order.fabric_number}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
