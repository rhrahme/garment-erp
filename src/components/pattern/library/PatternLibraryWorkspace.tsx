"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Layers, Plus } from "lucide-react";
import { FactoryBrandTabs } from "@/components/brands/FactoryBrandTabs";
import { MeasurementUnitToggle } from "@/components/pattern/library/MeasurementUnitToggle";
import { useFactoryBrandFilter } from "@/hooks/useFactoryBrandFilter";
import { useMeasurementUnitPreference } from "@/hooks/useMeasurementUnitPreference";
import { getBrandClientCodePrefix } from "@/lib/clients/codes";
import { orderMatchesBrandClientPrefix } from "@/lib/clients/orphan-reconciliation";
import { matchesNormalizedSearch } from "@/lib/search/normalize";
import { BasePatternCascadePicker } from "@/components/pattern/library/BasePatternCascadePicker";
import { TudViewerModal } from "@/components/pattern/library/TudViewerModal";
import {
  cascadeSelectionReady,
  emptyCascadeValue,
  PATTERN_SHEET_GARMENTS,
  preferredBrandCodeFromClientCode,
  resolveSelectedBase,
  type BasePatternCascadeValue,
} from "@/lib/pattern-library/base-pattern-picker";
import { invalidateBasePickerCache } from "@/lib/pattern-library/base-picker-cache";
import { formatBasePatternDisplayName } from "@/lib/pattern-library/derived-from";
import { generatePatternRef } from "@/lib/pattern-library/refs";
import { unitLabel } from "@/lib/pattern-library/measurements";
import {
  basePatternTudPreview,
  clientPatternTudPreview,
  type TudPreview,
} from "@/lib/pattern-library/tud-display";
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

/** Short badge codes for cut families the team refers to by abbreviation. */
const CUT_FAMILY_CODES: Record<string, string> = {
  "suit supply": "SS",
  "hugo boss": "HB",
};

function cutFamilyCode(family: string): string {
  const known = CUT_FAMILY_CODES[family.trim().toLowerCase()];
  if (known) return known;
  const words = family.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.map((word) => word[0]).join("").toUpperCase();
  return family.slice(0, 2).toUpperCase();
}

/** Owner's preferred browse order inside a family; unknown garments sort after, alphabetically. */
const GARMENT_ORDER = ["suit", "jacket", "overshirt", "shirt", "vest", "trouser", "shorts", "thobe"];

function garmentRank(garment: string): number {
  const index = GARMENT_ORDER.indexOf(garment.trim().toLowerCase());
  return index === -1 ? GARMENT_ORDER.length : index;
}

function compareGarments(a: string, b: string): number {
  return garmentRank(a) - garmentRank(b) || a.localeCompare(b);
}

function garmentLabel(garment: string): string {
  return garment.charAt(0).toUpperCase() + garment.slice(1);
}

function sizeRangeLabel(sizes: string[]): string {
  if (sizes.length === 0) return "no sizes";
  if (sizes.length === 1) return sizes[0];
  return `${sizes[0]}–${sizes[sizes.length - 1]}`;
}

function matchesFactoryBrand(
  brandId: string | null,
  brandPrefix: string | null,
  item: {
    house_brand_id?: string | null;
    house_brand_code?: string | null;
    client_code?: string | null;
  }
): boolean {
  if (!brandId) return true;
  // Prefer explicit house brand on the pattern; only fall back to client code.
  if (item.house_brand_id) return item.house_brand_id === brandId;
  if (brandPrefix && item.house_brand_code) {
    return item.house_brand_code.toUpperCase() === brandPrefix;
  }
  if (brandPrefix && item.client_code) {
    return orderMatchesBrandClientPrefix(item.client_code, brandPrefix);
  }
  return false;
}

export function PatternLibraryWorkspace({ brands }: { brands: BrandOption[] }) {
  const [tab, setTab] = useState<"bases" | "clients">("bases");
  const [library, setLibrary] = useState<PatternLibraryFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  /** null = all cut families. */
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const { brandId, setBrandId, hydrated } = useFactoryBrandFilter();
  const brandPrefix = brandId ? getBrandClientCodePrefix(brandId) : null;

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

  const brandScopedBases = useMemo(() => {
    if (!library) return [];
    return library.base_patterns.filter((base) => matchesFactoryBrand(brandId, brandPrefix, base));
  }, [library, brandId, brandPrefix]);

  const brandScopedClientPatterns = useMemo(() => {
    if (!library) return [];
    return library.client_patterns.filter((pattern) =>
      matchesFactoryBrand(brandId, brandPrefix, pattern)
    );
  }, [library, brandId, brandPrefix]);

  const bases = useMemo(() => {
    return brandScopedBases.filter((base) =>
      matchesNormalizedSearch(
        [base.name, base.cut_family, base.garment_type, base.cut_variant, base.house_brand_code, base.style_code],
        search
      )
    );
  }, [brandScopedBases, search]);

  const clientPatterns = useMemo(() => {
    return brandScopedClientPatterns.filter((pattern) =>
      matchesNormalizedSearch(
        [pattern.pattern_ref, pattern.client_name, pattern.client_code, pattern.garment_type, pattern.fabric],
        search
      )
    );
  }, [brandScopedClientPatterns, search]);

  /** Stable cut-family tab list from the full library so tabs don't vanish while filtering. */
  const cutFamilies = useMemo(() => {
    if (!library) return [];
    const names = [...new Set(library.base_patterns.map((base) => base.cut_family))].sort((a, b) =>
      a.localeCompare(b)
    );
    return names.map((name) => ({
      name,
      code: cutFamilyCode(name),
      matchCount: bases.filter((base) => base.cut_family === name).length,
    }));
  }, [library, bases]);

  /** cut family -> garment type -> base patterns, in the owner's browse order. */
  const familyGroups = useMemo(() => {
    const families = new Map<string, Map<string, BasePattern[]>>();
    for (const base of bases) {
      if (selectedFamily !== null && base.cut_family !== selectedFamily) continue;
      const garments = families.get(base.cut_family) ?? new Map<string, BasePattern[]>();
      garments.set(base.garment_type, [...(garments.get(base.garment_type) ?? []), base]);
      families.set(base.cut_family, garments);
    }
    return [...families.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([family, garments]) => ({
        family,
        garments: [...garments.entries()]
          .sort(([a], [b]) => compareGarments(a, b))
          .map(([garment, items]) => ({
            garment,
            items: [...items].sort(
              (a, b) => (a.cut_variant ?? "").localeCompare(b.cut_variant ?? "") || a.name.localeCompare(b.name)
            ),
          })),
      }));
  }, [bases, selectedFamily]);

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
          <span className="ml-1.5 text-xs opacity-80">({brandScopedBases.length})</span>
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
          <span className="ml-1.5 text-xs opacity-80">({brandScopedClientPatterns.length})</span>
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <MeasurementUnitToggle />
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

      {hydrated ? (
        <FactoryBrandTabs
          value={brandId}
          onChange={setBrandId}
          showAll
          allLabel="All brands"
          label="Filter by brand"
        />
      ) : null}

      <input
        type="search"
        placeholder={tab === "bases" ? "Search cut family, garment, brand..." : "Search ref, client, garment..."}
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
              ...PATTERN_SHEET_GARMENTS,
              ...(library?.base_patterns.map((base) => base.garment_type) ?? []),
              ...(library?.dictionary.flatMap((point) => point.garment_types) ?? []),
            ]),
          ]}
          onCreated={() => {
            setShowCreate(false);
            void load();
          }}
        />
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading pattern library...</p>
      ) : tab === "bases" ? (
        <div className="space-y-5">
          {/* Cut family cards — the owner's primary browse axis. Big targets for tablet. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <button
              type="button"
              onClick={() => setSelectedFamily(null)}
              className={cn(
                "min-h-20 rounded-xl border p-4 text-left transition-colors",
                selectedFamily === null
                  ? "border-indigo-600 bg-indigo-600 text-white shadow"
                  : "border-slate-200 bg-white text-slate-900 shadow-sm hover:border-indigo-300"
              )}
            >
              <p className="text-base font-semibold">All families</p>
              <p className={cn("mt-1 text-xs", selectedFamily === null ? "text-indigo-100" : "text-slate-500")}>
                {bases.length} pattern{bases.length === 1 ? "" : "s"}
              </p>
            </button>
            {cutFamilies.map((family) => {
              const active = selectedFamily === family.name;
              return (
                <button
                  key={family.name}
                  type="button"
                  onClick={() => setSelectedFamily(active ? null : family.name)}
                  className={cn(
                    "min-h-20 rounded-xl border p-4 text-left transition-colors",
                    active
                      ? "border-indigo-600 bg-indigo-600 text-white shadow"
                      : "border-slate-200 bg-white text-slate-900 shadow-sm hover:border-indigo-300"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-xs font-bold",
                        active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                      )}
                    >
                      {family.code}
                    </span>
                    <p className="truncate text-base font-semibold">{family.name}</p>
                  </div>
                  <p className={cn("mt-1 text-xs", active ? "text-indigo-100" : "text-slate-500")}>
                    {family.matchCount} pattern{family.matchCount === 1 ? "" : "s"}
                  </p>
                </button>
              );
            })}
          </div>

          {familyGroups.map(({ family, garments }) => (
            <div key={family} className="space-y-4">
              {selectedFamily === null ? (
                <h2 className="flex items-center gap-2 border-b border-slate-200 pb-2 text-base font-semibold text-slate-900">
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-600">
                    {cutFamilyCode(family)}
                  </span>
                  {family}
                </h2>
              ) : null}
              {garments.map(({ garment, items }) => (
                <div key={garment} className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    {garmentLabel(garment)}
                    <span className="ml-1.5 font-normal normal-case text-slate-400">({items.length})</span>
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {items.map((base) => {
                      const preview = basePatternTudPreview(base);
                      return (
                        <Link
                          key={base.id}
                          href={`/pattern/library/bases/${base.id}`}
                          className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-slate-900">{base.name}</p>
                              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                            </div>
                            <p className="mt-1 text-sm text-slate-600">
                              {base.cut_variant ? (
                                <span className="mr-1.5 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                                  {base.cut_variant}
                                </span>
                              ) : null}
                              Sizes {sizeRangeLabel(base.sizes)} ({base.sizes.length})
                            </p>
                            <p className="mt-2 text-xs text-slate-500">
                              {base.house_brand_code} · {base.points.length} points
                            </p>
                            {base.style_code || base.fabric ? (
                              <p className="mt-1 text-xs text-slate-400">
                                {[base.fabric, base.style_code, base.season].filter(Boolean).join(" · ")}
                              </p>
                            ) : null}
                          </div>
                          <CardTudThumb preview={preview} />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {familyGroups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No base patterns match.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-5">
          {groupClientPatterns(clientPatterns).map((group) => (
            <div key={group.clientId} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <h2 className="text-base font-semibold text-slate-900">
                  {group.clientName}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {group.clientCode} · {group.patterns.length} pattern
                    {group.patterns.length === 1 ? "" : "s"}
                  </span>
                </h2>
                <Link
                  href={`/pattern/library/fabrics/${group.clientId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 ring-1 ring-slate-200 hover:bg-indigo-50"
                >
                  <Layers className="h-4 w-4" />
                  Fabric board
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.patterns.map((pattern) => (
                  <ClientPatternCard
                    key={pattern.id}
                    pattern={pattern}
                    bases={library?.base_patterns ?? []}
                  />
                ))}
              </div>
            </div>
          ))}
          {clientPatterns.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No client patterns yet — create one from a base pattern + size.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Small extracted TUKA preview on library cards — click opens the full viewer. */
function CardTudThumb({
  preview,
  basePatternName,
}: {
  preview: TudPreview | null;
  /** Pass for client patterns; omit on base-pattern cards. */
  basePatternName?: string | null;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  if (!preview) return null;
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          // Card is a Link — open the viewer instead of navigating.
          event.preventDefault();
          event.stopPropagation();
          setViewerOpen(true);
        }}
        className="shrink-0 self-center rounded-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        title={preview.attachment.tud?.style_caption ?? preview.attachment.filename}
        aria-label="Open TUKA preview"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview.thumbnailUrl}
          alt={preview.attachment.tud?.style_caption ?? "TUKA pattern preview"}
          width={100}
          height={100}
          loading="lazy"
          className="h-20 w-20 rounded-lg border border-slate-200 bg-white object-contain p-1"
        />
      </button>
      {viewerOpen ? (
        <TudViewerModal
          attachment={preview.attachment}
          thumbnailUrl={preview.thumbnailUrl}
          downloadUrl={preview.downloadUrl}
          onClose={() => setViewerOpen(false)}
          basePatternName={basePatternName}
        />
      ) : null}
    </>
  );
}

/** Clients tab groups patterns per client — each group header links to the fabric board. */
function groupClientPatterns(patterns: ClientPattern[]): {
  clientId: string;
  clientCode: string;
  clientName: string;
  patterns: ClientPattern[];
}[] {
  const groups = new Map<string, ClientPattern[]>();
  for (const pattern of patterns) {
    groups.set(pattern.client_id, [...(groups.get(pattern.client_id) ?? []), pattern]);
  }
  return [...groups.entries()]
    .map(([clientId, items]) => ({
      clientId,
      clientCode: items[0]?.client_code ?? "",
      clientName: items[0]?.client_name || "Unknown client",
      patterns: items,
    }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
}

function ClientPatternCard({
  pattern,
  bases,
}: {
  pattern: ClientPattern;
  bases: BasePattern[];
}) {
  const finalVersion = pattern.versions.find((version) => version.is_final);
  const preview = clientPatternTudPreview(pattern);
  const linkedFabricCount =
    (pattern.linked_fabric_line_ids?.length ?? 0) + (pattern.linked_fabric_refs?.length ?? 0);
  const linkedBase = pattern.base_pattern_id
    ? bases.find((base) => base.id === pattern.base_pattern_id) ?? null
    : null;
  const basePatternName = formatBasePatternDisplayName(linkedBase);
  return (
    <Link
      href={`/pattern/library/clients/${pattern.id}`}
      className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow"
    >
      <div className="min-w-0 flex-1">
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
          {pattern.base_size ? ` · size ${pattern.base_size}` : ""}
          {pattern.fabric ? ` · ${pattern.fabric}` : ""}
        </p>
        {basePatternName ? (
          <p className="mt-1 truncate text-xs font-medium text-indigo-700" title={basePatternName}>
            from {basePatternName}
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-400">Custom</p>
        )}
        {linkedFabricCount > 0 ? (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
            <Layers className="h-3 w-3" />
            {linkedFabricCount} fabric{linkedFabricCount === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      <CardTudThumb preview={preview} basePatternName={basePatternName} />
    </Link>
  );
}

function CreateBaseForm({ brands, onCreated }: { brands: BrandOption[]; onCreated: () => void }) {
  const { unit } = useMeasurementUnitPreference();
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [cutFamily, setCutFamily] = useState("");
  const [garment, setGarment] = useState("");
  const [variant, setVariant] = useState("");
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
      invalidateBasePickerCache();
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
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Unit (site-wide: {unitLabel(unit)})
          </span>
          <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            Uses the Pattern Units toggle above
          </p>
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
  const { unit } = useMeasurementUnitPreference();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [cascade, setCascade] = useState<BasePatternCascadeValue>(() => emptyCascadeValue());
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

  const client = clients.find((candidate) => candidate.id === clientId) ?? null;
  const preferredBrand = preferredBrandCodeFromClientCode(client?.code);

  useEffect(() => {
    if (!preferredBrand) return;
    setCascade((prev) =>
      prev.houseBrandCode ? prev : { ...prev, houseBrandCode: preferredBrand }
    );
  }, [preferredBrand]);

  const base = resolveSelectedBase(bases, cascade);

  const suggestedRef = generatePatternRef({
    cut_family: base?.cut_family ?? null,
    garment_type: cascade.garmentType || base?.garment_type || null,
    fabric: fabric || base?.fabric || null,
    house_brand_code: base?.house_brand_code ?? preferredBrand,
    cut_variant: base?.cut_variant ?? null,
    size: cascade.baseSize || null,
  });

  async function submit() {
    if (!client || !cascadeSelectionReady(cascade)) {
      setError(
        cascade.origin === "library"
          ? "Client, garment, and a library base + size are required."
          : "Client and garment are required."
      );
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
          garment_type: cascade.garmentType,
          base_pattern_id:
            cascade.origin === "library" ? cascade.basePatternId || null : null,
          base_size: cascade.origin === "library" ? cascade.baseSize || null : null,
          fabric: fabric || null,
          description: description || null,
          pattern_ref: refOverride || null,
          unit,
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
            onChange={(e) => {
              const nextId = e.target.value;
              setClientId(nextId);
              const nextClient = clients.find((candidate) => candidate.id === nextId);
              const brand = preferredBrandCodeFromClientCode(nextClient?.code);
              if (brand) {
                setCascade((prev) => ({ ...prev, houseBrandCode: brand }));
              }
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Select client…</option>
            {clients.map((option) => (
              <option key={option.id} value={option.id}>
                {option.code} — {clientDisplayName(option)}
              </option>
            ))}
          </select>
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
      </div>

      <div className="mt-3 rounded-lg border border-white/80 bg-white/70 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Garment sheet &amp; origin
        </p>
        <BasePatternCascadePicker
          bases={bases}
          extraGarments={garments}
          value={cascade}
          onChange={setCascade}
        />
      </div>

      <label className="mt-3 block text-sm">
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
