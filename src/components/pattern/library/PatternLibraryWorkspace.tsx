"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { matchesNormalizedSearch } from "@/lib/search/normalize";
import { generatePatternRef } from "@/lib/pattern-library/refs";
import { unitLabel } from "@/lib/pattern-library/measurements";
import type { BasePattern, ClientPattern, PatternLibraryFile } from "@/lib/types/pattern-library";
import { cn } from "@/lib/utils";

export interface BrandOption {
  id: string;
  code: string;
  name: string;
}

interface ClientOption {
  id: string;
  code: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
}

function clientDisplayName(client: ClientOption): string {
  return [client.first_name, client.middle_name, client.last_name].filter(Boolean).join(" ");
}

export function PatternLibraryWorkspace({ brands }: { brands: BrandOption[] }) {
  const [tab, setTab] = useState<"bases" | "clients">("bases");
  const [library, setLibrary] = useState<PatternLibraryFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pattern/library?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      setLibrary(await res.json());
    } catch {
      setLibrary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const bases = useMemo(() => {
    if (!library) return [];
    return library.base_patterns.filter((base) =>
      matchesNormalizedSearch(
        [base.name, base.cut_family, base.garment_type, base.cut_variant, base.house_brand_code, base.style_code],
        search
      )
    );
  }, [library, search]);

  const clientPatterns = useMemo(() => {
    if (!library) return [];
    return library.client_patterns.filter((pattern) =>
      matchesNormalizedSearch(
        [pattern.pattern_ref, pattern.client_name, pattern.client_code, pattern.garment_type, pattern.fabric],
        search
      )
    );
  }, [library, search]);

  const basesByBrand = useMemo(() => {
    const groups = new Map<string, BasePattern[]>();
    for (const base of bases) {
      const key = base.house_brand_code;
      groups.set(key, [...(groups.get(key) ?? []), base]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [bases]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setTab("bases");
            setShowCreate(false);
          }}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === "bases" ? "bg-indigo-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          )}
        >
          Base patterns
          <span className="ml-1.5 text-xs opacity-80">({library?.base_patterns.length ?? 0})</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("clients");
            setShowCreate(false);
          }}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === "clients" ? "bg-indigo-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          )}
        >
          Client patterns
          <span className="ml-1.5 text-xs opacity-80">({library?.client_patterns.length ?? 0})</span>
        </button>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setShowCreate((open) => !open)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            {tab === "bases" ? "New base pattern" : "New client pattern"}
          </button>
        </div>
      </div>

      <input
        type="search"
        placeholder={tab === "bases" ? "Search cut family, garment, brand…" : "Search ref, client, garment…"}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />

      {showCreate && tab === "bases" ? (
        <CreateBaseForm
          brands={brands}
          onCreated={() => {
            setShowCreate(false);
            void load();
          }}
        />
      ) : null}
      {showCreate && tab === "clients" ? (
        <CreateClientPatternForm
          bases={library?.base_patterns ?? []}
          garments={[
            ...new Set([
              "jacket",
              "shirt",
              "trouser",
              "shorts",
              "thobe",
              "vest",
              "overshirt",
              ...(library?.base_patterns.map((base) => base.garment_type) ?? []),
              ...(library?.dictionary.flatMap((point) => point.garment_types) ?? []),
            ]),
          ].sort()}
          onCreated={() => {
            setShowCreate(false);
            void load();
          }}
        />
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading pattern library…</p>
      ) : tab === "bases" ? (
        <div className="space-y-6">
          {basesByBrand.map(([brandCode, brandBases]) => (
            <div key={brandCode} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {brandCode} — {brands.find((brand) => brand.code === brandCode)?.name ?? brandCode}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {brandBases.map((base) => (
                  <Link
                    key={base.id}
                    href={`/pattern/library/bases/${base.id}`}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-900">{base.name}</p>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {base.cut_family} · {base.garment_type}
                      {base.cut_variant ? ` · ${base.cut_variant}` : ""}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {base.sizes.length} sizes ({base.sizes[0]}–{base.sizes[base.sizes.length - 1]}) ·{" "}
                      {base.points.length} points · {unitLabel(base.unit)}
                    </p>
                    {base.style_code || base.fabric ? (
                      <p className="mt-1 text-xs text-slate-400">
                        {[base.fabric, base.style_code, base.season].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {bases.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No base patterns match.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {clientPatterns.map((pattern) => (
            <ClientPatternCard key={pattern.id} pattern={pattern} />
          ))}
          {clientPatterns.length === 0 ? (
            <p className="col-span-full rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No client patterns yet — create one from a base pattern + size.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ClientPatternCard({ pattern }: { pattern: ClientPattern }) {
  const finalVersion = pattern.versions.find((version) => version.is_final);
  return (
    <Link
      href={`/pattern/library/clients/${pattern.id}`}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="break-all font-semibold text-slate-900">{pattern.pattern_ref}</p>
        {finalVersion ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            Final · T{finalVersion.version}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Trial {pattern.versions.length}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {pattern.client_name} · {pattern.garment_type}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        {pattern.versions.length} trial{pattern.versions.length === 1 ? "" : "s"}
        {pattern.base_size ? ` · from ${pattern.base_size}` : ""}
        {pattern.fabric ? ` · ${pattern.fabric}` : ""}
      </p>
    </Link>
  );
}

function CreateBaseForm({ brands, onCreated }: { brands: BrandOption[]; onCreated: () => void }) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [cutFamily, setCutFamily] = useState("");
  const [garment, setGarment] = useState("");
  const [variant, setVariant] = useState("");
  const [unit, setUnit] = useState<"in" | "cm">("in");
  const [sizesText, setSizesText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const brand = brands.find((candidate) => candidate.id === brandId);
    if (!brand || !cutFamily.trim() || !garment.trim()) {
      setError("House brand, cut family and garment are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pattern/library/bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          house_brand_id: brand.id,
          house_brand_code: brand.code,
          cut_family: cutFamily,
          garment_type: garment,
          cut_variant: variant || null,
          unit,
          sizes: sizesText.split(",").map((size) => size.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to create base pattern.");
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create base pattern.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
      <p className="mb-3 text-sm font-semibold text-slate-800">New base pattern</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">House brand</span>
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.code} — {brand.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Cut family</span>
          <input
            value={cutFamily}
            onChange={(e) => setCutFamily(e.target.value)}
            placeholder="Suit Supply / Massimo / Boggi / Comfort"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Garment</span>
          <input
            value={garment}
            onChange={(e) => setGarment(e.target.value)}
            placeholder="jacket / shirt / shorts / trouser / thobe"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Cut variant (optional)</span>
          <input
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
            placeholder="Regular / Long / Short"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Unit</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as "in" | "cm")}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="in">Inches (fractions)</option>
            <option value="cm">Centimeters</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Sizes (comma-separated)</span>
          <input
            value={sizesText}
            onChange={(e) => setSizesText(e.target.value)}
            placeholder="48, 50, 52… or R-35, R-36… or S, M, L"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create base pattern"}
      </button>
    </div>
  );
}

function CreateClientPatternForm({
  bases,
  garments,
  onCreated,
}: {
  bases: BasePattern[];
  /** Known garment types — selecting one pre-fills the measurement template. */
  garments: string[];
  onCreated: () => void;
}) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [garment, setGarment] = useState("");
  const [baseId, setBaseId] = useState("");
  const [baseSize, setBaseSize] = useState("");
  const [fabric, setFabric] = useState("");
  const [description, setDescription] = useState("");
  const [refOverride, setRefOverride] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clients", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setClients(data?.clients ?? []))
      .catch(() => setClients([]));
  }, []);

  const base = bases.find((candidate) => candidate.id === baseId) ?? null;
  useEffect(() => {
    if (base && !garment) setGarment(base.garment_type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseId]);

  const suggestedRef = generatePatternRef({
    cut_family: base?.cut_family ?? null,
    garment_type: garment || base?.garment_type || null,
    fabric: fabric || base?.fabric || null,
    house_brand_code: base?.house_brand_code ?? null,
    cut_variant: base?.cut_variant ?? null,
    size: baseSize || null,
  });

  async function submit() {
    const client = clients.find((candidate) => candidate.id === clientId);
    if (!client || !(garment.trim() || base)) {
      setError("Client and garment are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pattern/library/client-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: client.id,
          client_code: client.code,
          client_name: clientDisplayName(client),
          garment_type: garment || base?.garment_type || "",
          base_pattern_id: baseId || null,
          base_size: baseSize || null,
          fabric: fabric || null,
          description: description || null,
          pattern_ref: refOverride || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to create client pattern.");
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create client pattern.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
      <p className="mb-3 text-sm font-semibold text-slate-800">New client pattern</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Client</span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Select client…</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.code} — {clientDisplayName(client)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Derived from base</span>
          <select
            value={baseId}
            onChange={(e) => {
              setBaseId(e.target.value);
              setBaseSize("");
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">No base (blank grid)</option>
            {bases.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.house_brand_code} · {candidate.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Base size</span>
          <select
            value={baseSize}
            onChange={(e) => setBaseSize(e.target.value)}
            disabled={!base}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
          >
            <option value="">Select size…</option>
            {(base?.sizes ?? []).map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Garment</span>
          <select
            value={garment}
            onChange={(e) => setGarment(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">{base ? `Same as base (${base.garment_type})` : "Select garment…"}</option>
            {garments.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-slate-400">
            Without a base, the garment&apos;s measurement template pre-fills the grid.
          </span>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Fabric (optional)</span>
          <input
            value={fabric}
            onChange={(e) => setFabric(e.target.value)}
            placeholder="linen / cotton…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Description (optional)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm sm:col-span-2 lg:col-span-3">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Pattern ref (auto-generated, editable)
          </span>
          <input
            value={refOverride}
            onChange={(e) => setRefOverride(e.target.value.toUpperCase())}
            placeholder={suggestedRef || "SS-SHIRT-LINEN-FR-REG-XXL"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
          />
        </label>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create client pattern"}
      </button>
    </div>
  );
}
