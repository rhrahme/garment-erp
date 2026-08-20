"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Plus, Search } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  CLIENT_SORT_OPTIONS,
  filterClientsByBrand,
  formatClientJoinedLabel,
  searchClients,
  sortClients,
  type ClientSortBy,
} from "@/lib/clients/filter";
import { ClientNameChangeRequestForm } from "@/components/clients/ClientNameChangeRequestForm";
import { ClientTitleSelect } from "@/components/clients/ClientTitleSelect";
import { formatClientDisplayName, isClientNameTitle, migrateClientName } from "@/lib/clients/names";
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
  /** Show an inline "add new client" option in the dropdown (requires brandId for the client code). */
  allowCreate?: boolean;
  /** Non-admins can propose a rename for the selected client (admin approves). */
  allowNameRequest?: boolean;
  /** Called after an inline create succeeds so the parent can add the client to its list. */
  onClientCreated?: (client: ClientProfile) => void;
  /** Called after a name-change request is sent or cancelled. */
  onClientUpdated?: (client: ClientProfile) => void;
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
  allowCreate = false,
  allowNameRequest = false,
  onClientCreated,
  onClientUpdated,
}: ClientSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 150);
  const [sortBy, setSortBy] = useState<ClientSortBy>(defaultSort);
  const [sortHydrated, setSortHydrated] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState<string | null>(null);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedClient = clients.find((client) => client.id === value) ?? null;

  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) return;
        const data = (await res.json()) as { is_admin?: boolean };
        setIsAdmin(Boolean(data.is_admin));
      } catch {
        /* ignore */
      }
    }
    if (allowNameRequest) void loadSession();
  }, [allowNameRequest]);

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
    if (!open) {
      setCreating(false);
      setCreateError(null);
    }
  }, [open]);

  useEffect(() => {
    if (selectedClient) {
      setQuery(`${selectedClient.code} — ${formatClientDisplayName(selectedClient)}`);
    } else if (!open) {
      setQuery("");
    }
  }, [selectedClient, open]);

  const brand = brandId ? getFactoryBrandById(brandId) : null;
  const blocked = disabled || !brandId;
  const canCreate = allowCreate && Boolean(brandId);

  function startCreate() {
    const selectedLabel = selectedClient
      ? `${selectedClient.code} — ${formatClientDisplayName(selectedClient)}`
      : null;
    const seed = selectedLabel && query === selectedLabel ? "" : query;
    const words = seed.trim().split(/\s+/).filter(Boolean);
    if (words[0] && isClientNameTitle(words[0])) {
      const parsed = migrateClientName({ name: seed.trim() });
      setNewTitle(parsed.title);
      setNewFirstName(parsed.first_name);
      setNewLastName([parsed.middle_name, parsed.last_name].filter(Boolean).join(" "));
    } else {
      setNewTitle(null);
      setNewFirstName(words[0] ?? "");
      setNewLastName(words.slice(1).join(" "));
    }
    setCreateError(null);
    setCreating(true);
  }

  function cancelCreate() {
    setCreating(false);
    setCreateError(null);
    setNewTitle(null);
  }

  async function saveNewClient() {
    const first = newFirstName.trim();
    const last = newLastName.trim();
    if (!first || !last) {
      setCreateError("First and last name are both required.");
      return;
    }
    if (!brandId) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      const saveRes = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          first_name: first,
          last_name: last,
          brand_ids: [brandId],
          is_active: true,
        }),
      });
      const saveData = (await saveRes.json()) as { client?: ClientProfile; error?: string };
      if (!saveRes.ok || !saveData.client) {
        throw new Error(saveData.error || "Could not save the new client.");
      }
      const created = saveData.client;
      onClientCreated?.(created);
      onChange(created.id);
      setQuery(`${created.code} — ${formatClientDisplayName(created)}`);
      setCreating(false);
      setOpen(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not save the new client.");
    } finally {
      setCreateBusy(false);
    }
  }

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
            "w-full min-h-[44px] rounded-lg border border-slate-300 py-2.5 pl-10 pr-10 text-base sm:text-sm",
            blocked && "cursor-not-allowed bg-slate-50 text-slate-400"
          )}
          autoComplete="off"
        />
        <button
          type="button"
          disabled={blocked}
          onClick={() => setOpen((prev) => !prev)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-slate-400 hover:text-slate-600 disabled:opacity-40"
          aria-label="Toggle client list"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {allowCreate && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => {
              setOpen(true);
              startCreate();
            }}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add new client
          </button>
          {!brandId && (
            <p className="text-xs text-slate-500">Pick a production brand first to add a client.</p>
          )}
        </div>
      )}

      {allowNameRequest && !isAdmin && selectedClient && (
        <div className="mt-2">
          <ClientNameChangeRequestForm
            key={`${selectedClient.id}-${selectedClient.name_change_requested_at ?? "none"}`}
            client={selectedClient}
            onUpdated={(next) => onClientUpdated?.(next)}
          />
        </div>
      )}

      {brand && (
        <p className="mt-1 text-xs text-slate-500">
          {brand.name} clients · {filteredClients.length} match{filteredClients.length !== 1 ? "es" : ""} ·{" "}
          {sortLabel.toLowerCase()}
        </p>
      )}

      {open && !blocked && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {canCreate && creating && (
            <div className="space-y-2 border-b border-slate-200 bg-indigo-50/60 p-3">
              <p className="text-xs font-medium text-indigo-900">New client · {brand?.name}</p>
              <div className="grid grid-cols-[6.5rem_1fr_1fr] gap-2">
                <ClientTitleSelect
                  value={newTitle}
                  onChange={setNewTitle}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
                <input
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  placeholder="First name"
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  autoFocus
                />
                <input
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  placeholder="Last name"
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              {createError && <p className="text-xs text-red-600">{createError}</p>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void saveNewClient()}
                  disabled={createBusy}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {createBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Save new client
                </button>
                <button
                  type="button"
                  onClick={cancelCreate}
                  disabled={createBusy}
                  className="min-h-[40px] rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                A client code is assigned automatically. Phone and other details can be added later on the Clients
                page.
              </p>
            </div>
          )}
          {canCreate && !creating && (
            <button
              type="button"
              onClick={startCreate}
              className="flex w-full min-h-[44px] items-center gap-2 border-b border-slate-200 px-4 py-3 text-left text-sm font-medium text-indigo-700 hover:bg-indigo-50"
            >
              <Plus className="h-4 w-4" />
              {query.trim() ? `Add "${query.trim()}" as a new client` : "Add a new client"}
            </button>
          )}
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
                        "flex w-full min-h-[44px] flex-col gap-0.5 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50",
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
