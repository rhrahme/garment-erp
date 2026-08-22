"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MissingFilesFilter,
  MissingFilesReport,
} from "@/lib/pattern-library/missing-files-report";
import { cn } from "@/lib/utils";

const FILTERS: Array<{ id: MissingFilesFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "missing_tud", label: "Missing TUD" },
  { id: "missing_other", label: "Missing DXF / RUL" },
];

function FilePill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
      )}
    >
      {label} {ok ? "yes" : "no"}
    </span>
  );
}

export function PatternMissingFilesList() {
  const [filter, setFilter] = useState<MissingFilesFilter>("all");
  const [query, setQuery] = useState("");
  const [report, setReport] = useState<MissingFilesReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextFilter: MissingFilesFilter) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/pattern/missing-files?filter=${encodeURIComponent(nextFilter)}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as MissingFilesReport & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load.");
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const brands = useMemo(() => {
    if (!report) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return report.brands;
    return report.brands
      .map((brand) => ({
        ...brand,
        clients: brand.clients.filter(
          (client) =>
            client.client_name.toLowerCase().includes(needle) ||
            client.client_code.toLowerCase().includes(needle)
        ),
      }))
      .filter((brand) => brand.clients.length > 0);
  }, [query, report]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              filter === item.id
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            )}
          >
            {item.label}
          </button>
        ))}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search client"
          className="ml-auto w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm sm:w-56"
        />
      </div>

      {report ? (
        <p className="text-sm text-slate-600">
          {report.client_count} clients | {report.missing_tud_count} missing TUD |{" "}
          {report.missing_other_count} missing DXF/RUL
        </p>
      ) : null}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {loading && !report ? <p className="text-sm text-slate-500">Loading files...</p> : null}

      {brands.map((brand) => (
        <section key={brand.brand_name} className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">
            {brand.brand_name}
            <span className="ml-2 text-sm font-normal text-slate-500">
              {brand.clients.length} clients
            </span>
          </h2>
          {brand.clients.map((client) => (
            <div
              key={`${brand.brand_name}-${client.client_id}`}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-slate-900">{client.client_name}</p>
                <p className="font-mono text-xs text-slate-500">{client.client_code}</p>
              </div>
              <ul className="mt-3 space-y-2">
                {client.patterns.map((row, index) => (
                  <li
                    key={`${row.pattern_id ?? row.href}-${row.garment_type}-${index}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {row.garment_type}
                        {row.no_pattern ? (
                          <span className="ml-2 text-xs font-semibold text-amber-800">
                            No pattern
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.pattern_ref ?? "Not consolidated"}
                        {row.so_numbers.length > 0 ? ` | ${row.so_numbers.join(", ")}` : ""}
                        {row.missing_tud_labels.length > 0 && !row.has_tud
                          ? ` | ${row.missing_tud_labels.join(", ")}`
                          : ""}
                      </p>
                    </div>
                    <FilePill label="TUD" ok={row.has_tud} />
                    <FilePill label="DXF" ok={row.has_dxf} />
                    <FilePill label="RUL" ok={row.has_rul} />
                    <Link
                      href={row.href}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {row.no_pattern ? "Open order" : "Open"}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      {!loading && brands.length === 0 ? (
        <p className="text-sm text-slate-500">No clients match this filter.</p>
      ) : null}
    </div>
  );
}
