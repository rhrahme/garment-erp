"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { filterClientsByBrand, searchClients } from "@/lib/clients/filter";
import { formatClientDisplayName } from "@/lib/clients/names";
import { getFactoryBrandById } from "@/lib/data/factory-brands";
import { cn } from "@/lib/utils";
import type { ClientProfile } from "@/lib/types/clients";

export interface ClientSearchSelectProps {
  clients: ClientProfile[];
  value: string;
  onChange: (clientId: string) => void;
  brandId?: string | null;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function ClientSearchSelect({
  clients,
  value,
  onChange,
  brandId = null,
  disabled = false,
  placeholder = "Search by name or client code…",
  className,
}: ClientSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedClient = clients.find((client) => client.id === value) ?? null;

  const filteredClients = useMemo(() => {
    const byBrand = filterClientsByBrand(clients, brandId);
    return searchClients(byBrand, query).sort((a, b) =>
      formatClientDisplayName(a).localeCompare(formatClientDisplayName(b))
    );
  }, [brandId, clients, query]);

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
          Showing {brand.name} clients only · {filteredClients.length} match{filteredClients.length !== 1 ? "es" : ""}
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
                      <span className="font-mono text-xs text-slate-500">{client.code}</span>
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
