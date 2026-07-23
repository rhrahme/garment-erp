"use client";

import type { FocusEvent as ReactFocusEvent, PointerEvent as ReactPointerEvent } from "react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, List, Plus, Search, Table2, Trash2, UserCircle, X } from "lucide-react";
import { FactoryBrandTabs } from "@/components/brands/FactoryBrandTabs";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AutoSaveStatusBar } from "@/components/ui/AutoSaveStatus";
import { filterClientsByBrand, searchClients } from "@/lib/clients/filter";
import { getFactoryBrands } from "@/lib/data/factory-brands";
import { generateNextClientCode, getBrandClientCodePrefix, getJoinMonthYear } from "@/lib/clients/codes";
import { formatClientDisplayName, formatReferredByName, isBlankClientPlaceholder, isClientSaveable } from "@/lib/clients/names";
import { useFactoryBrandFilter } from "@/hooks/useFactoryBrandFilter";
import { useSalesBrandScope } from "@/hooks/useSalesBrandScope";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";
import type { ClientProfile, ClientsFile } from "@/lib/types/clients";

const allFactoryBrands = getFactoryBrands();

type ClientViewMode = "list" | "table" | "cards";
type ClientSortBy = "name-asc" | "name-desc" | "code-asc" | "code-desc" | "joined-desc" | "joined-asc";

const VIEW_MODE_OPTIONS: { id: ClientViewMode; label: string; icon: typeof List }[] = [
  { id: "list", label: "List", icon: List },
  { id: "table", label: "Table", icon: Table2 },
  { id: "cards", label: "Cards", icon: LayoutGrid },
];

const SORT_OPTIONS: { id: ClientSortBy; label: string }[] = [
  { id: "name-asc", label: "Name A–Z" },
  { id: "name-desc", label: "Name Z–A" },
  { id: "code-asc", label: "Client code" },
  { id: "code-desc", label: "Client code (reverse)" },
  { id: "joined-desc", label: "Newest joined" },
  { id: "joined-asc", label: "Oldest joined" },
];

const VIEW_STORAGE_KEY = "erp-clients-view-mode";
const SORT_STORAGE_KEY = "erp-clients-sort-by";

function emptyClient(): ClientProfile {
  return {
    id: `new-${Date.now()}`,
    code: "",
    joined_at: null,
    first_name: "",
    middle_name: null,
    last_name: "",
    brand_ids: [],
    contact_person: null,
    referred_by_first_name: null,
    referred_by_middle_name: null,
    referred_by_last_name: null,
    email: null,
    phone: null,
    country: null,
    city: null,
    address: null,
    payment_terms: null,
    client_reference_prefix: null,
    notes: null,
    is_active: true,
  };
}

function cloneClients(data: ClientsFile): ClientsFile {
  return JSON.parse(JSON.stringify(data)) as ClientsFile;
}

type ScrollSnapshot = {
  ancestors: { el: HTMLElement; top: number; left: number }[];
  winX: number;
  winY: number;
};

/**
 * Snapshot the scroll position of every scrollable ancestor of `node` (plus the
 * window) so it can be restored after focus moves.
 *
 * Safari/iOS ignore `focus({ preventScroll: true })` and scroll the nearest
 * scrollable ancestor to bring the focused field into view. On the dashboard
 * that ancestor is `<main className="overflow-y-auto">`, so focusing any field
 * in the new-client row yanks the page down to the client list while the user
 * is still typing. Capturing the positions and re-applying them right after the
 * focus keeps everything pinned in place.
 */
function snapshotScroll(node: HTMLElement | null): ScrollSnapshot {
  const ancestors: { el: HTMLElement; top: number; left: number }[] = [];
  for (let cur = node; cur; cur = cur.parentElement) {
    const { overflowY, overflowX } = getComputedStyle(cur);
    if (/(auto|scroll|overlay)/.test(`${overflowY}${overflowX}`)) {
      ancestors.push({ el: cur, top: cur.scrollTop, left: cur.scrollLeft });
    }
  }
  return { ancestors, winX: window.scrollX, winY: window.scrollY };
}

function applyScroll(snapshot: ScrollSnapshot) {
  for (const { el, top, left } of snapshot.ancestors) {
    el.scrollTop = top;
    el.scrollLeft = left;
  }
  window.scrollTo(snapshot.winX, snapshot.winY);
}

/** Focus an element without letting the page jump (programmatic auto-focus). */
function focusWithoutScroll(input: HTMLElement | null) {
  if (!input) return;
  const snapshot = snapshotScroll(input.parentElement);
  input.focus({ preventScroll: true });
  applyScroll(snapshot);
  // iOS Safari applies the scroll-into-view after the focus event, so re-apply
  // on the next frame to override it.
  requestAnimationFrame(() => applyScroll(snapshot));
}

/**
 * Keep the surrounding scroll containers pinned while the user moves between
 * fields of a form (tap, click, or keyboard tab). Returns handlers to spread
 * onto the form container so every field — not just the auto-focused one — is
 * protected from Safari/iOS's scroll-on-focus behavior.
 */
function useStableScrollOnFocus() {
  const snapshotRef = useRef<ScrollSnapshot | null>(null);

  const capture = useCallback((node: HTMLElement | null) => {
    // The scrollable ancestors are shared by every field in the container, so
    // snapshotting from the container itself is sufficient and accurate.
    snapshotRef.current = snapshotScroll(node);
  }, []);

  const restore = useCallback(() => {
    const snapshot = snapshotRef.current;
    if (!snapshot) return;
    applyScroll(snapshot);
    requestAnimationFrame(() => applyScroll(snapshot));
  }, []);

  return useMemo(
    () => ({
      // Pointer down + blur fire before the next field gains focus (and before
      // the browser scrolls it into view), so the captured positions are the
      // ones we want to restore.
      onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => capture(event.currentTarget),
      onBlurCapture: (event: ReactFocusEvent<HTMLElement>) => capture(event.currentTarget),
      onFocusCapture: () => restore(),
    }),
    [capture, restore]
  );
}

function sortClients(clients: ClientProfile[], sortBy: ClientSortBy): ClientProfile[] {
  return [...clients].sort((a, b) => {
    switch (sortBy) {
      case "name-desc":
        return formatClientDisplayName(b).localeCompare(formatClientDisplayName(a));
      case "code-asc":
        return (a.code || "").localeCompare(b.code || "");
      case "code-desc":
        return (b.code || "").localeCompare(a.code || "");
      case "joined-desc":
        return new Date(b.joined_at ?? 0).getTime() - new Date(a.joined_at ?? 0).getTime();
      case "joined-asc":
        return new Date(a.joined_at ?? 0).getTime() - new Date(b.joined_at ?? 0).getTime();
      case "name-asc":
      default:
        return formatClientDisplayName(a).localeCompare(formatClientDisplayName(b));
    }
  });
}

function formatJoinedLabel(client: ClientProfile): string {
  if (!client.joined_at) return "—";
  return new Date(client.joined_at).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

export function ClientProfilesEditor() {
  const [saved, setSaved] = useState<ClientsFile>({ updated_at: null, clients: [] });
  const [draft, setDraft] = useState<ClientsFile>({ updated_at: null, clients: [] });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [canViewClientContact, setCanViewClientContact] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 200);
  const [isDirty, setIsDirty] = useState(false);
  const {
    allowedBrandIds,
    brands: assignableBrands,
    hydrated: salesBrandScopeHydrated,
    isScoped: isBrandScoped,
  } = useSalesBrandScope();
  const defaultBrandFilter =
    allowedBrandIds?.length === 1 ? allowedBrandIds[0]! : null;
  const { brandId: brandFilter, setBrandId: setBrandFilter, hydrated: brandFilterHydrated } =
    useFactoryBrandFilter(defaultBrandFilter);
  const [viewMode, setViewMode] = useState<ClientViewMode>("list");
  const [sortBy, setSortBy] = useState<ClientSortBy>("name-asc");
  const firstNameInputRef = useRef<HTMLInputElement>(null);
  const stableScrollHandlers = useStableScrollOnFocus();

  useEffect(() => {
    const storedView = localStorage.getItem(VIEW_STORAGE_KEY);
    const normalizedView = storedView === "compact" ? "list" : storedView;
    const storedSort = localStorage.getItem(SORT_STORAGE_KEY) as ClientSortBy | null;
    if (normalizedView && VIEW_MODE_OPTIONS.some((option) => option.id === normalizedView)) {
      setViewMode(normalizedView as ClientViewMode);
    }
    if (storedSort && SORT_OPTIONS.some((option) => option.id === storedSort)) {
      setSortBy(storedSort);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem(SORT_STORAGE_KEY, sortBy);
  }, [sortBy]);

  useEffect(() => {
    if (!salesBrandScopeHydrated || !isBrandScoped || !allowedBrandIds?.length) return;
    if (allowedBrandIds.length === 1) {
      setBrandFilter(allowedBrandIds[0]!);
      return;
    }
    if (brandFilter && !allowedBrandIds.includes(brandFilter)) {
      setBrandFilter(allowedBrandIds[0]!);
    }
  }, [allowedBrandIds, brandFilter, isBrandScoped, salesBrandScopeHydrated, setBrandFilter]);

  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) return;
        const data = (await res.json()) as { is_super_admin?: boolean; can_view_client_contact?: boolean };
        setIsSuperAdmin(Boolean(data.is_super_admin));
        setCanViewClientContact(data.can_view_client_contact !== false);
      } catch {
        /* ignore */
      }
    }
    void loadSession();
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/clients");
        if (!res.ok) throw new Error("Failed to load clients");
        const data = (await res.json()) as ClientsFile;
        setSaved(data);
        setDraft(cloneClients(data));
        setIsDirty(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load clients");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const clientsToPersist = useMemo(
    () => draft.clients.filter((client) => !isBlankClientPlaceholder(client)),
    [draft.clients]
  );
  const canAutoSave = useMemo(
    () => clientsToPersist.length > 0 && clientsToPersist.every(isClientSaveable),
    [clientsToPersist]
  );
  const personClients = useMemo(
    () => draft.clients.filter((client) => client.client_kind !== "retail_brand"),
    [draft.clients]
  );

  // True while the user is filling in a brand-new row that isn't saveable yet
  // (e.g. just picked a brand, or hasn't entered first + last name). Auto-save
  // must stay paused during this window: a blank/incomplete new row is excluded
  // from `clientsToPersist`, so saving the *other* rows and replacing the draft
  // with the server response would silently drop the row being created.
  const isEditingIncompleteNewClient = useMemo(() => {
    if (!editingId) return false;
    const editing = draft.clients.find((client) => client.id === editingId);
    if (!editing) return false;
    const isNew = !saved.clients.some((savedClient) => savedClient.id === editing.id);
    return isNew && !isClientSaveable(editing);
  }, [editingId, draft.clients, saved.clients]);

  const displayClients = useMemo(() => {
    const filtered = searchClients(filterClientsByBrand(personClients, brandFilter), debouncedSearchQuery, {
      excludeContactFields: !canViewClientContact,
    });
    const sorted = sortClients(filtered, sortBy);
    if (!editingId) return sorted;

    // Always keep the row being edited pinned and visible — even if it no
    // longer matches the active brand filter or search. Looking it up in the
    // unfiltered list (not `sorted`) means a brand-new row with no brand yet,
    // or a row whose brand was just changed, never silently disappears while
    // the user is still filling it in.
    const editing = personClients.find((client) => client.id === editingId);
    if (!editing) return sorted;

    return [editing, ...sorted.filter((client) => client.id !== editingId)];
  }, [personClients, debouncedSearchQuery, brandFilter, sortBy, canViewClientContact, editingId]);

  const hasActiveFilters = Boolean(searchQuery.trim() || brandFilter);

  const persistDraft = useCallback(async () => {
    const payload = { ...draft, clients: clientsToPersist };
    const res = await fetch("/api/clients", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to save clients");
    const savedData = data as ClientsFile;
    setSaved(savedData);
    setDraft(() => {
      const next = cloneClients(savedData);
      // If a save happened while the user is still creating a row (so it was
      // excluded from the payload), keep that in-progress row in the draft so
      // the open editor never vanishes from under them.
      if (editingId && !next.clients.some((client) => client.id === editingId)) {
        const inProgress = draft.clients.find((client) => client.id === editingId);
        if (inProgress) next.clients = [inProgress, ...next.clients];
      }
      return next;
    });
    setIsDirty(false);
    setError(null);
  }, [clientsToPersist, draft, editingId]);

  const autoSaveWaitingMessage = canViewClientContact
    ? "Add first name, last name, and brand to auto-save"
    : "Add first name, last name, and brand — contact fields are optional for your account";

  const { status: autoSaveStatus, error: autoSaveError, isSaving, saveNow } = useAutoSave({
    isDirty,
    canSave: canAutoSave && !isEditingIncompleteNewClient,
    onSave: persistDraft,
    delayMs: 3_000,
    waitingMessage: autoSaveWaitingMessage,
  });

  async function closeClientEditor(clientId: string) {
    const client = draft.clients.find((c) => c.id === clientId);
    const isNew = client ? !saved.clients.some((s) => s.id === clientId) : false;

    // Closing a brand-new row that was never completed abandons it: drop it
    // from the draft rather than trying (and failing) to persist it.
    if (client && isNew && !isClientSaveable(client)) {
      setDraft((prev) => ({ ...prev, clients: prev.clients.filter((c) => c.id !== clientId) }));
      setEditingId(null);
      return;
    }

    if (editingId === clientId && isDirty && canAutoSave) {
      try {
        await persistDraft();
      } catch {
        return;
      }
    }
    setEditingId(null);
  }

  function isNewClient(client: ClientProfile): boolean {
    return !saved.clients.some((savedClient) => savedClient.id === client.id);
  }

  function allClientsForCode(excludeClientId?: string): ClientProfile[] {
    const merged = [...saved.clients];
    for (const client of draft.clients) {
      const index = merged.findIndex((row) => row.id === client.id);
      if (index >= 0) merged[index] = client;
      else merged.push(client);
    }
    return excludeClientId ? merged.filter((client) => client.id !== excludeClientId) : merged;
  }

  function assignCodeForNewClient(client: ClientProfile, brandIds: string[]): string {
    const primaryBrandId = brandIds[0];
    if (!primaryBrandId) return "";
    return generateNextClientCode(allClientsForCode(client.id), primaryBrandId, {
      excludeClientId: client.id,
      joinedAt: new Date(),
    }) ?? "";
  }

  function updateClient(id: string, patch: Partial<ClientProfile>) {
    setIsDirty(true);
    setDraft((prev) => ({
      ...prev,
      clients: prev.clients.map((client) => (client.id === id ? { ...client, ...patch } : client)),
    }));
  }

  function toggleBrand(clientId: string, brandId: string) {
    const client = draft.clients.find((c) => c.id === clientId);
    if (!client) return;
    const brand_ids = client.brand_ids.includes(brandId)
      ? client.brand_ids.filter((id) => id !== brandId)
      : [...client.brand_ids, brandId];

    const patch: Partial<ClientProfile> = { brand_ids };
    if (isNewClient(client)) {
      patch.code = assignCodeForNewClient(client, brand_ids);
    }
    updateClient(clientId, patch);
  }

  function addClient() {
    const client = emptyClient();
    if (allowedBrandIds?.length === 1) {
      client.brand_ids = [allowedBrandIds[0]!];
      client.code = assignCodeForNewClient(client, client.brand_ids) ?? "";
    }
    setSearchQuery("");
    setIsDirty(true);
    setDraft((prev) => ({ ...prev, clients: [client, ...prev.clients] }));
    setEditingId(client.id);
  }

  useEffect(() => {
    if (!editingId) return;
    const timer = window.setTimeout(() => focusWithoutScroll(firstNameInputRef.current), 0);
    return () => window.clearTimeout(timer);
  }, [editingId]);

  function handleDiscard() {
    setDraft(cloneClients(saved));
    setIsDirty(false);
    setEditingId(null);
    setError(null);
  }

  async function deleteClient(client: ClientProfile) {
    const name = formatClientDisplayName(client) || client.code || "this client";
    const confirmed = window.confirm(
      `Delete ${name}? This cannot be undone. Sales orders linked to this client must be removed first.`
    );
    if (!confirmed) return;

    setDeletingId(client.id);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(client.id)}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to delete client");

      setSaved((prev) => ({
        ...prev,
        clients: prev.clients.filter((row) => row.id !== client.id),
      }));
      setDraft((prev) => ({
        ...prev,
        clients: prev.clients.filter((row) => row.id !== client.id),
      }));
      if (editingId === client.id) setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete client");
    } finally {
      setDeletingId(null);
    }
  }

  function renderBrandBadges(client: ClientProfile) {
    const brands = allFactoryBrands.filter((b) => client.brand_ids.includes(b.id));
    if (brands.length === 0) {
      return <Badge className="bg-amber-100 text-amber-700">No brand assigned</Badge>;
    }
    return brands.map((brand) => (
      <Badge key={brand.id} className="bg-indigo-100 text-indigo-700">
        {brand.name}
      </Badge>
    ));
  }

  function renderClientActions(client: ClientProfile, isEditing: boolean) {
    return (
      <div className="flex items-center gap-2">
        {isSuperAdmin && (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            disabled={deletingId === client.id || isSaving}
            onClick={() => void deleteClient(client)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            {deletingId === client.id ? "Deleting…" : "Delete"}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={isSaving}
          onClick={() => {
            if (isEditing) {
              void closeClientEditor(client.id);
              return;
            }
            setEditingId(client.id);
          }}
        >
          {isEditing ? (isSaving ? "Saving…" : "Done") : "Edit"}
        </Button>
      </div>
    );
  }

  function renderClientEditor(client: ClientProfile) {
    const isNew = isNewClient(client);
    const needsBrand = client.brand_ids.length === 0;

    const nameSection = (
      <div className="md:col-span-2">
        <p className="text-sm font-medium text-slate-700">Client name</p>
        <div className="mt-2 grid gap-4 md:grid-cols-3">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">First</span>
            <input
              ref={editingId === client.id ? firstNameInputRef : undefined}
              value={client.first_name}
              onChange={(e) => updateClient(client.id, { first_name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="First name"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Middle</span>
            <input
              value={client.middle_name ?? ""}
              onChange={(e) => updateClient(client.id, { middle_name: e.target.value.trim() || null })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Optional"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Last</span>
            <input
              value={client.last_name}
              onChange={(e) => updateClient(client.id, { last_name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Last name"
            />
          </label>
        </div>
      </div>
    );

    const referredBySection = canViewClientContact ? (
      <div className="md:col-span-2">
        <p className="text-sm font-medium text-slate-700">Referred by</p>
        <div className="mt-2 grid gap-4 md:grid-cols-3">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">First</span>
            <input
              value={client.referred_by_first_name ?? ""}
              onChange={(e) =>
                updateClient(client.id, { referred_by_first_name: e.target.value.trim() || null })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="First name"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Middle</span>
            <input
              value={client.referred_by_middle_name ?? ""}
              onChange={(e) =>
                updateClient(client.id, { referred_by_middle_name: e.target.value.trim() || null })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Optional"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Last</span>
            <input
              value={client.referred_by_last_name ?? ""}
              onChange={(e) =>
                updateClient(client.id, { referred_by_last_name: e.target.value.trim() || null })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Last name"
            />
          </label>
        </div>
      </div>
    ) : null;

    const brandSection = (
      <div className="md:col-span-2">
        <p className="text-sm font-medium text-slate-700">
          Production brand(s)
          {isNew && (
            <span className="ml-1 font-semibold text-red-500" aria-hidden="true">
              *
            </span>
          )}
          {isNew && (
            <span className="ml-2 align-middle text-xs font-normal uppercase tracking-wide text-indigo-600">
              Required — pick this first
            </span>
          )}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Code prefix uses your first selected brand. Format:{" "}
          <span className="font-mono">
            {getBrandClientCodePrefix(client.brand_ids[0] ?? "gliani") ?? "GL"}-{getJoinMonthYear()}-0001
          </span>{" "}
          — middle digits are month/year joined; the last 4 digits keep counting for each brand (
          {getJoinMonthYear().slice(0, 2)}/{getJoinMonthYear().slice(2)}).
        </p>
        {isNew && needsBrand && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            Select a production brand to begin — the client code is generated from the brand prefix, and the
            client can&apos;t be saved without one.
          </p>
        )}
        <div
          className={cn(
            "mt-2 flex flex-wrap gap-2 rounded-lg",
            isNew && needsBrand && "p-2 ring-1 ring-amber-300"
          )}
        >
          {assignableBrands.map((brand) => (
            <button
              key={brand.id}
              type="button"
              onClick={() => toggleBrand(client.id, brand.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                client.brand_ids.includes(brand.id)
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {brand.name}
              {getBrandClientCodePrefix(brand.id) ? (
                <span className="ml-1 opacity-75">({getBrandClientCodePrefix(brand.id)})</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    );

    const codeSection = (
      <div className="block text-sm">
        <span className="font-medium text-slate-700">Client code</span>
        <div className="mt-1 flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-slate-700">
          {client.code || (client.brand_ids[0] ? "Assigned when saved" : "Select a brand first")}
        </div>
        <span className="mt-1 block text-xs text-slate-500">
          {isNew
            ? "Auto-assigned on save — month/year reflects join date."
            : "Permanent — cannot be changed."}
        </span>
      </div>
    );

    return (
      <div className="grid gap-4 md:grid-cols-2" {...stableScrollHandlers}>
        {/* For a new client the brand drives the client code, so it comes first
            and is required before anything can be saved. */}
        {isNew ? (
          <>
            {brandSection}
            {codeSection}
            <div className="md:col-span-2" />
            {nameSection}
            {referredBySection}
          </>
        ) : (
          <>
            {nameSection}
            {referredBySection}
            {brandSection}
            {codeSection}
            <div className="md:col-span-2" />
          </>
        )}

        {canViewClientContact && (
          <>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Contact person</span>
              <input
                value={client.contact_person ?? ""}
                onChange={(e) => updateClient(client.id, { contact_person: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Email</span>
              <input
                type="email"
                value={client.email ?? ""}
                onChange={(e) => updateClient(client.id, { email: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Mobile number</span>
              <PhoneInput
                value={client.phone}
                onChange={(phone) => updateClient(client.id, { phone })}
                className="mt-1"
              />
              <span className="mt-1 block text-xs text-slate-500">Defaults to Saudi Arabia (+966)</span>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Country</span>
              <input
                value={client.country ?? ""}
                onChange={(e) => updateClient(client.id, { country: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </>
        )}
        <label className="block text-sm md:col-span-2">
          <span className="font-medium text-slate-700">Notes</span>
          <textarea
            value={client.notes ?? ""}
            onChange={(e) => updateClient(client.id, { notes: e.target.value || null })}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </div>
    );
  }

  function renderClientSummary(client: ClientProfile) {
    return (
      <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
        <p>
          <span className="text-slate-400">Name:</span> {formatClientDisplayName(client) || "—"}
        </p>
        <p>
          <span className="text-slate-400">Joined:</span> {formatJoinedLabel(client)}
        </p>
        {canViewClientContact && (
          <>
            <p>
              <span className="text-slate-400">Referred by:</span> {formatReferredByName(client) || "—"}
            </p>
            <p>
              <span className="text-slate-400">Contact:</span> {client.contact_person ?? "—"}
            </p>
            <p>
              <span className="text-slate-400">Email:</span> {client.email ?? "—"}
            </p>
            <p>
              <span className="text-slate-400">Mobile:</span> {client.phone ?? "—"}
            </p>
            <p>
              <span className="text-slate-400">Country:</span> {client.country ?? "—"}
            </p>
          </>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
        Loading client profiles…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-slate-600">
            {hasActiveFilters
              ? `${displayClients.length} of ${personClients.length} client${personClients.length !== 1 ? "s" : ""}`
              : `${personClients.length} bespoke client${personClients.length !== 1 ? "s" : ""}`}{" "}
            · ready-made brands live under Ready-Made
          </p>
          <AutoSaveStatusBar
            status={autoSaveStatus}
            error={autoSaveError}
            waitingMessage={autoSaveWaitingMessage}
            isDirty={isDirty}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={addClient}>
            <Plus className="mr-2 h-4 w-4" />
            Add client
          </Button>
          {isDirty && (
            <Button variant="secondary" onClick={handleDiscard} disabled={isSaving}>
              Discard
            </Button>
          )}
          {isDirty && canAutoSave && autoSaveStatus === "error" && (
            <Button variant="secondary" onClick={() => void saveNow()} disabled={isSaving}>
              Retry save
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {personClients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <UserCircle className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-lg font-medium text-slate-700">No clients yet</p>
          <p className="mt-2 text-sm text-slate-500">
            Pick a production brand first — code format is GL-0526-0001 (brand · month/year joined · number).
          </p>
          <Button className="mt-4" onClick={addClient}>
            <Plus className="mr-2 h-4 w-4" />
            Add client
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <label className="relative block flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={Boolean(editingId)}
                  title={editingId ? "Finish editing the open client before searching the list" : undefined}
                  placeholder={
                    canViewClientContact
                      ? "Search by name, client code, email, mobile, or referred by…"
                      : "Search by name or client code…"
                  }
                  className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-10 text-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </label>
              {brandFilterHydrated && salesBrandScopeHydrated && (
                <FactoryBrandTabs
                  value={brandFilter}
                  onChange={setBrandFilter}
                  showAll={!isBrandScoped}
                  allLabel="All"
                  label="Brand"
                  brands={assignableBrands}
                  className="lg:min-w-[22rem]"
                />
              )}
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">View</span>
                {VIEW_MODE_OPTIONS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setViewMode(id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      viewMode === id
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Sort</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as ClientSortBy)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {displayClients.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
              No clients match your search.
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setBrandFilter(null);
                  }}
                  className="mt-2 block w-full text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : viewMode === "list" ? (
            <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {displayClients.map((client, index) => {
                const isEditing = editingId === client.id;
                const name = formatClientDisplayName(client) || "Unnamed client";
                const brands = allFactoryBrands.filter((b) => client.brand_ids.includes(b.id));
                const brandLabel = brands.map((b) => b.name).join(", ") || "No brand";

                return (
                  <li
                    key={client.id}
                    className={cn(
                      "border-slate-200",
                      index > 0 && "border-t",
                      isEditing ? "bg-slate-50" : "hover:bg-slate-50/70"
                    )}
                  >
                    <div className="flex items-center gap-4 px-4 py-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <p className="truncate font-medium text-slate-900">{name}</p>
                          <p className="font-mono text-xs text-slate-400">{client.code || "NEW"}</p>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-slate-500">
                          {brandLabel}
                          {client.joined_at ? ` · Joined ${formatJoinedLabel(client)}` : ""}
                          {canViewClientContact && formatReferredByName(client)
                            ? ` · Referred by ${formatReferredByName(client)}`
                            : ""}
                          {canViewClientContact && client.email ? ` · ${client.email}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0">{renderClientActions(client, isEditing)}</div>
                    </div>
                    {isEditing && (
                      <div className="border-t border-slate-200 bg-white px-4 py-4">{renderClientEditor(client)}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : viewMode === "table" ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Brand</th>
                    <th className="px-4 py-3">Joined</th>
                    {canViewClientContact && <th className="px-4 py-3">Referred by</th>}
                    {canViewClientContact && <th className="px-4 py-3">Contact</th>}
                    {canViewClientContact && <th className="px-4 py-3">Email</th>}
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayClients.map((client) => {
                    const isEditing = editingId === client.id;
                    return (
                      <Fragment key={client.id}>
                        <tr className="hover:bg-slate-50/60">
                          <td className="px-4 py-3 font-mono text-xs text-slate-600">{client.code || "NEW"}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {formatClientDisplayName(client) || "Unnamed client"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">{renderBrandBadges(client)}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{formatJoinedLabel(client)}</td>
                          {canViewClientContact && (
                            <td className="px-4 py-3 text-slate-600">{formatReferredByName(client) || "—"}</td>
                          )}
                          {canViewClientContact && (
                            <td className="px-4 py-3 text-slate-600">{client.contact_person ?? "—"}</td>
                          )}
                          {canViewClientContact && (
                            <td className="px-4 py-3 text-slate-600">{client.email ?? "—"}</td>
                          )}
                          <td className="px-4 py-3">
                            <div className="flex justify-end">{renderClientActions(client, isEditing)}</div>
                          </td>
                        </tr>
                        {isEditing && (
                          <tr>
                            <td colSpan={canViewClientContact ? 8 : 5} className="border-t border-slate-100 bg-slate-50/50 px-4 py-4">
                              {renderClientEditor(client)}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
        <div className="space-y-4">
          {displayClients.map((client) => {
            const isEditing = editingId === client.id;

            return (
              <div key={client.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{client.code || "NEW"}</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">
                      {formatClientDisplayName(client) || "Unnamed client"}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">{renderBrandBadges(client)}</div>
                  </div>
                  {renderClientActions(client, isEditing)}
                </div>

                {isEditing ? (
                  <div className="mt-4">{renderClientEditor(client)}</div>
                ) : (
                  <div className="mt-4">{renderClientSummary(client)}</div>
                )}
              </div>
            );
          })}
        </div>
          )}
        </>
      )}
    </div>
  );
}
