"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  CLIENT_SORT_OPTIONS,
  filterClientsByBrand,
  formatClientJoinedLabel,
  searchClients,
  sortClients,
  type ClientSortBy,
} from "@/lib/clients/filter";
import { formatClientDisplayName } from "@/lib/clients/names";
import { getFactoryBrandById } from "@/lib/data/factory-brands";
import { cn } from "@/lib/utils";
import type { ClientProfile } from "@/lib/types/clients";

const SORT_STORAGE_KEY = "erp-sales-order-client-sort";

export interface ClientSearchSelectProps {
  clients: ClientProfile[];
  value: string;
  onChange: (clientId: string) => void;
  brandId?: string | null;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  defaultSort?: ClientSortBy;
  showSort?: boolean;
}

export function ClientSearchSelect({
  clients,
  value,
  onChange,
  brandId = null,
  disabled = false,
  placeholder = "Search by name or client code…",
  className,
  defaultSort = "joined-desc",
  showSort = true,
}: ClientSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 150);
  const [sortBy, setSortBy] = useState<ClientSortBy>(defaultSort);
  const [sortHydrated, setSortHydrated] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedClient = clients.find((client) => client.id === value) ?? null;

  useEffect(() => {
    const stored = localStorage.getItem(SORT_STORAGE_KEY) as ClientSortBy | null;
    if (stored && CLIENT_SORT_OPTIONS.some((option) => option.id === stored)) {
      setSortBy(stored);
    }
    setSortHydrated(true);
  }, []);

  useEffect(() => {
    if (!sortHydrated) return;
    localStorage.setItem(SORT_STORAGE_KEY, sortBy);
  }, [sortBy, sortHydrated]);

  const filteredClients = useMemo(() => {
    const byBrand = filterClientsByBrand(clients, brandId);
    const selectedLabel = selectedClient
      ? `${selectedClient.code} — ${formatClientDisplayName(selectedClient)}`
      : null;
    const list =
      selectedLabel && debouncedQuery === selectedLabel
        ? byBrand
        : searchClients(byBrand, debouncedQuery);
    return sortClients(list, sortBy);
  }, [brandId, clients, debouncedQuery, selectedClient, sortBy]);

  const sortLabel = CLIENT_SORT_OPTIONS.find((option) => option.id === sortBy)?.label ?? "Sort";
  const showJoinedDate = sortBy === "joined-desc" || sortBy === "joined-asc";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!brandId) {
      setQuery("");
      setOpen(false);
    }
  }, [brandId]);

  useEffect(() => {
    if (selectedClient) {
      setQuery(`${selectedClient.code} — ${formatClientDisplayName(selectedClient)}`);
    } else if (!open) {
      setQuery("");
    }
  }, [selectedClient, open]);

  const brand = brandId ? getFactoryBrandById(brandId) : null;
  const blocked = disabled || !brandId;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {showSort && brandId && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-600">Sort clients</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as ClientSortBy)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
            aria-label="Sort clients"
          >
            {CLIENT_SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          disabled={blocked}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onChange("");
          }}
          onFocus={() => !blocked && setOpen(true)}
          placeholder={blocked ? "Select a production brand first…" : placeholder}
          className={cn(
            "w-full rounded-lg border border-slate-300 py-2 pl-10 pr-10 text-sm",
            blocked && "cursor-not-allowed bg-slate-50 text-slate-400"
          )}
          autoComplete="off"
        />
        <button
          type="button"
          disabled={blocked}
          onClick={() => setOpen((prev) => !prev)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-40"
          aria-label="Toggle client list"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {brand && (
        <p className="mt-1 text-xs text-slate-500">
          {brand.name} clients · {filteredClients.length} match{filteredClients.length !== 1 ? "es" : ""} ·{" "}
          {sortLabel.toLowerCase()}
        </p>
      )}

      {open && !blocked && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {filteredClients.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">
              {query.trim() ? "No clients match your search." : "No clients for this brand."}
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {filteredClients.map((client) => {
                const name = formatClientDisplayName(client);
                const active = client.id === value;
                return (
                  <li key={client.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(client.id);
                        setQuery(`${client.code} — ${name}`);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full flex-col gap-0.5 border-b border-slate-100 px-4 py-2.5 text-left last:border-0 hover:bg-slate-50",
                        active && "bg-indigo-50"
                      )}
                    >
                      <span className="font-medium text-slate-900">{name}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-slate-500">
                        <span>{client.code}</span>
                        {showJoinedDate && client.joined_at ? (
                          <span className="font-sans text-slate-400">
                            Added {formatClientJoinedLabel(client)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
