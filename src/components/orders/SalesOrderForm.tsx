"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AutoSaveStatusBar } from "@/components/ui/AutoSaveStatus";
import { GARMENT_STITCH_TYPES, getLabelCountForGarment } from "@/lib/sales-orders/garment-types";
import { FactoryBrandTabs } from "@/components/brands/FactoryBrandTabs";
import { ClientSearchSelect } from "@/components/clients/ClientSearchSelect";
import { filterPersonClients } from "@/lib/clients/filter";
import { formatClientDisplayName } from "@/lib/clients/names";
import { useFactoryBrandFilter } from "@/hooks/useFactoryBrandFilter";
import { useLocalDraft } from "@/hooks/useLocalDraft";
import { DRAFT_KEYS } from "@/lib/autosave/draft-keys";
import type { FabricSearchItem } from "@/lib/autosave/fabric-search-item";
import {
  isSalesOrderDraftEmpty,
  SALES_ORDER_DRAFT_VERSION,
  type SalesOrderFormDraft,
  type SalesOrderLineDraft,
} from "@/lib/autosave/sales-order-draft";
import type { ClientProfile, ClientsFile } from "@/lib/types/clients";
import { formatSupplierUnitPrice } from "@/lib/currency/format";
import { DualCurrencyPrice } from "@/components/currency/DualCurrencyPrice";
import { DeliveryDestinationTabs } from "@/components/shipping/DeliveryDestinationTabs";
import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";
import { normalizeLoroPianaFabricNumber } from "@/lib/fabric-sourcing/loro-piana-styles";
import { formatFabricStockLabel } from "@/lib/fabric-sourcing/fabric-stock";

type FabricBrand = { id: string; name: string; has_price_list?: boolean };

type DraftLine = SalesOrderLineDraft;

type LineEditForm = {
  fabric_number: string;
  garment_type: string;
  label_count: string;
  meters: string;
};

async function resolveFabricItem(
  supplierId: string,
  supplierName: string,
  fabricNumber: string
): Promise<FabricSearchItem> {
  const trimmed = fabricNumber.trim();
  const params = new URLSearchParams({
    supplier_id: supplierId,
    q: trimmed,
    limit: "20",
  });
  const res = await fetch(`/api/fabric-search?${params}`);
  if (res.ok) {
    const data = (await res.json()) as { items: FabricSearchItem[] };
    const lookup =
      supplierId === "loro-piana" ? normalizeLoroPianaFabricNumber(trimmed) : trimmed;
    const match =
      data.items.find(
        (item) => !item.manual && item.fabric_number.toLowerCase() === lookup.toLowerCase()
      ) ??
      data.items.find((item) => item.fabric_number.toLowerCase() === trimmed.toLowerCase());
    if (match) return match;
  }

  return {
    id: `manual-${supplierId}-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    supplier_id: supplierId,
    supplier_name: supplierName,
    fabric_number: trimmed,
    composition: null,
    color: null,
    weight_gsm: null,
    width_cm: null,
    width_inches: null,
    unit_price: null,
    unit: "meters",
    manual: true,
  };
}

function formatWidth(line: { width_cm?: number | null; width_inches?: number | null }) {
  if (line.width_cm != null) return `${line.width_cm} cm`;
  if (line.width_inches != null) return `${line.width_inches}"`;
  return "—";
}

function formatWeight(weight_gsm: number | null | undefined) {
  if (weight_gsm != null) return `${weight_gsm} gsm`;
  return "—";
}

function formatLinePrice(line: { supplier_id: string; unit_price: number | null; unit: string }) {
  if (line.unit_price == null) return "—";
  return formatSupplierUnitPrice(line.unit_price, line.supplier_id, line.unit);
}

function FabricPicker({
  brandName,
  supplierId,
  value,
  onChange,
  onSelect,
}: {
  brandName: string;
  supplierId: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: FabricSearchItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fabrics, setFabrics] = useState<FabricSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    if (!supplierId || !open) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          supplier_id: supplierId,
          q: value.trim(),
          limit: "60",
        });
        const res = await fetch(`/api/fabric-search?${params}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { items: FabricSearchItem[] };
        if (!cancelled) setFabrics(data.items);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, value.trim() ? 200 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, supplierId, value]);

  useEffect(() => {
    setFabrics([]);
    setOpen(false);
  }, [supplierId]);

  function selectManualFabric(fabricNumber: string) {
    onSelect({
      id: `manual-${supplierId}-${fabricNumber.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      supplier_id: supplierId,
      supplier_name: brandName,
      fabric_number: fabricNumber.trim(),
      composition: null,
      color: null,
      weight_gsm: null,
      width_cm: null,
      width_inches: null,
      unit_price: null,
      unit: "meters",
      manual: true,
    });
    onChange(fabricNumber.trim());
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Fabric</span>
        <div className="relative mt-1">
          <input
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) {
                e.preventDefault();
                const match = fabrics.find(
                  (item) => item.fabric_number.toLowerCase() === value.trim().toLowerCase()
                );
                if (match) {
                  onSelect(match);
                  onChange(match.fabric_number);
                  setOpen(false);
                } else {
                  selectManualFabric(value.trim());
                }
              }
            }}
            placeholder={`Type or select ${brandName} fabric…`}
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-10 text-sm"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
            aria-label="Toggle fabric list"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </label>

      {open && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading ? (
            <p className="px-4 py-3 text-sm text-slate-500">Loading fabrics…</p>
          ) : fabrics.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">
              {value.trim()
                ? "Press Enter to use this fabric number manually."
                : "No price list yet — type a fabric number and press Enter."}
            </p>
          ) : (
            <>
              <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-400">
                {value.trim()
                  ? `${fabrics.length} match${fabrics.length !== 1 ? "es" : ""}`
                  : `Showing first ${fabrics.length} — type to filter`}
              </p>
              <ul className="max-h-64 overflow-y-auto">
                {fabrics.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(item);
                        onChange(item.fabric_number);
                        setOpen(false);
                      }}
                      className="flex w-full flex-col gap-0.5 border-b border-slate-100 px-4 py-2.5 text-left hover:bg-slate-50 last:border-0"
                    >
                      <span className="font-mono font-medium text-slate-900">
                        {item.fabric_number}
                        {item.manual ? (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-sans font-medium uppercase tracking-wide text-amber-800">
                            Manual
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-slate-500">
                        {item.manual
                          ? "Manual entry — specs can be filled when the price list is imported"
                          : [
                              item.composition ?? "—",
                              item.weight_gsm != null ? `${item.weight_gsm} gsm` : null,
                              formatWidth(item) !== "—" ? formatWidth(item) : null,
                              item.unit_price != null ? formatLinePrice(item) : null,
                              formatFabricStockLabel(item),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SalesOrderForm() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [fabricBrands, setFabricBrands] = useState<FabricBrand[]>([]);
  const { brandId: productionBrandId, setBrandId: setProductionBrandId, hydrated: brandFilterHydrated } =
    useFactoryBrandFilter();
  const [clientId, setClientId] = useState("");
  const [deliveryDestination, setDeliveryDestination] = useState<DeliveryDestination | "">("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);

  const [selectedFabricBrandId, setSelectedFabricBrandId] = useState("");
  const [fabricPickerValue, setFabricPickerValue] = useState("");
  const [pendingFabric, setPendingFabric] = useState<FabricSearchItem | null>(null);
  const [garmentType, setGarmentType] = useState("");
  const [draftLabelCount, setDraftLabelCount] = useState("1");
  const [draftMeters, setDraftMeters] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lineEditForm, setLineEditForm] = useState<LineEditForm | null>(null);
  const [savingLineEdit, setSavingLineEdit] = useState(false);
  const skipClientResetRef = useRef(false);

  const draftSnapshot = useMemo(
    (): SalesOrderFormDraft => ({
      version: SALES_ORDER_DRAFT_VERSION,
      savedAt: new Date().toISOString(),
      productionBrandId,
      clientId,
      deliveryDestination,
      deliveryDate,
      notes,
      lines,
      selectedFabricBrandId,
      fabricPickerValue,
      pendingFabric,
      garmentType,
      draftLabelCount,
      draftMeters,
    }),
    [
      productionBrandId,
      clientId,
      deliveryDestination,
      deliveryDate,
      notes,
      lines,
      selectedFabricBrandId,
      fabricPickerValue,
      pendingFabric,
      garmentType,
      draftLabelCount,
      draftMeters,
    ]
  );

  const restoreDraft = useCallback(
    (draft: SalesOrderFormDraft) => {
      if (draft.version !== SALES_ORDER_DRAFT_VERSION || isSalesOrderDraftEmpty(draft)) return;
      skipClientResetRef.current = true;
      setProductionBrandId(draft.productionBrandId);
      setClientId(draft.clientId);
      setDeliveryDestination(draft.deliveryDestination ?? "");
      setDeliveryDate(draft.deliveryDate);
      setNotes(draft.notes);
      setLines(draft.lines);
      setSelectedFabricBrandId(draft.selectedFabricBrandId);
      setFabricPickerValue(draft.fabricPickerValue);
      setPendingFabric(draft.pendingFabric);
      setGarmentType(draft.garmentType);
      setDraftLabelCount(draft.draftLabelCount);
      setDraftMeters(draft.draftMeters);
      queueMicrotask(() => {
        skipClientResetRef.current = false;
      });
    },
    [setProductionBrandId]
  );

  const {
    status: draftStatus,
    error: draftError,
    restored: draftRestored,
    hydrated: draftHydrated,
    isDirty: draftDirty,
    clearDraft,
    dismissRestore,
    saveNow,
  } = useLocalDraft({
    draftKey: DRAFT_KEYS.salesOrderNew,
    value: draftSnapshot,
    enabled: !loading && brandFilterHydrated,
    canSave: true,
    isEmpty: isSalesOrderDraftEmpty,
    onRestore: restoreDraft,
  });

  function discardDraft() {
    clearDraft();
    setProductionBrandId(null);
    setClientId("");
    setDeliveryDestination("");
    setDeliveryDate("");
    setNotes("");
    setLines([]);
    resetAddFlow();
    setError(null);
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [clientsRes, brandsRes] = await Promise.all([fetch("/api/clients"), fetch("/api/fabric-brands")]);
        if (!clientsRes.ok) throw new Error("Failed to load clients");
        const clientsData = (await clientsRes.json()) as ClientsFile;
        setClients(filterPersonClients(clientsData.clients.filter((client) => client.is_active)));

        if (brandsRes.ok) {
          const brandsData = (await brandsRes.json()) as { brands: FabricBrand[] };
          setFabricBrands(brandsData.brands);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load form data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const selectedClient = clients.find((client) => client.id === clientId);
  const selectedFabricBrand = fabricBrands.find((brand) => brand.id === selectedFabricBrandId) ?? null;

  const linesByFabricBrand = useMemo(() => {
    const groups = new Map<string, { name: string; lines: DraftLine[] }>();
    for (const line of lines) {
      const bucket = groups.get(line.supplier_id) ?? { name: line.supplier_name, lines: [] };
      bucket.lines.push(line);
      groups.set(line.supplier_id, bucket);
    }
    return groups;
  }, [lines]);

  function resetAddFlow() {
    setSelectedFabricBrandId("");
    setFabricPickerValue("");
    setPendingFabric(null);
    setGarmentType("");
    setDraftLabelCount("1");
    setDraftMeters("");
  }

  function handleProductionBrandChange(nextBrandId: string | null) {
    setProductionBrandId(nextBrandId);
    if (skipClientResetRef.current) return;
    setClientId("");
    setLines([]);
    resetAddFlow();
    setError(null);
  }

  function handleClientChange(nextClientId: string) {
    setClientId(nextClientId);
    if (skipClientResetRef.current) return;
    setLines([]);
    resetAddFlow();
    setGarmentType("");
    setError(null);
  }

  function handleFabricBrandChange(nextBrandId: string) {
    setSelectedFabricBrandId(nextBrandId);
    setFabricPickerValue("");
    setPendingFabric(null);
    setGarmentType("");
    setDraftLabelCount("1");
    setDraftMeters("");
  }

  function selectFabric(item: FabricSearchItem) {
    setPendingFabric(item);
    setGarmentType("");
    setDraftLabelCount("1");
    setDraftMeters("");
    setFabricPickerValue(item.fabric_number);
  }

  function addLine() {
    if (!pendingFabric) return;

    if (!garmentType) {
      setError("Select a garment type.");
      return;
    }

    const meters = Number(draftMeters);
    if (!Number.isFinite(meters) || meters <= 0) {
      setError("Enter meters to order.");
      return;
    }

    const labelCount = Number(draftLabelCount);
    if (!Number.isInteger(labelCount) || labelCount < 1) {
      setError("Enter a valid label count (at least 1).");
      return;
    }

    setError(null);
    setLines((prev) => [
      ...prev,
      {
        ...pendingFabric,
        lineId: `line-${Date.now()}-${pendingFabric.fabric_number}`,
        garment_type: garmentType,
        label_count: labelCount,
        meters: String(meters),
      },
    ]);

    setPendingFabric(null);
    setGarmentType("");
    setDraftLabelCount("1");
    setDraftMeters("");
    setFabricPickerValue("");
  }

  function updateMeters(lineId: string, meters: string) {
    setLines((prev) => prev.map((line) => (line.lineId === lineId ? { ...line, meters } : line)));
  }

  function removeLine(lineId: string) {
    if (editingLineId === lineId) {
      setEditingLineId(null);
      setLineEditForm(null);
    }
    setLines((prev) => prev.filter((line) => line.lineId !== lineId));
  }

  function startEditLine(line: DraftLine) {
    setEditingLineId(line.lineId);
    setLineEditForm({
      fabric_number: line.fabric_number,
      garment_type: line.garment_type,
      label_count: String(line.label_count),
      meters: line.meters,
    });
    setError(null);
  }

  function cancelEditLine() {
    setEditingLineId(null);
    setLineEditForm(null);
    setError(null);
  }

  async function saveEditLine(line: DraftLine) {
    if (!lineEditForm) return;

    const meters = Number(lineEditForm.meters);
    if (!Number.isFinite(meters) || meters <= 0) {
      setError("Enter valid meters for this fabric line.");
      return;
    }

    const labelCount = Number(lineEditForm.label_count);
    if (!Number.isInteger(labelCount) || labelCount < 1) {
      setError("Enter a valid label count (at least 1).");
      return;
    }

    if (!lineEditForm.garment_type) {
      setError("Select a garment type.");
      return;
    }

    const nextFabricNumber = lineEditForm.fabric_number.trim();
    if (!nextFabricNumber) {
      setError("Enter a fabric number.");
      return;
    }

    setSavingLineEdit(true);
    setError(null);
    try {
      const fabricChanged = nextFabricNumber.toLowerCase() !== line.fabric_number.toLowerCase();
      const fabricItem = fabricChanged
        ? await resolveFabricItem(line.supplier_id, line.supplier_name, nextFabricNumber)
        : line;

      setLines((prev) =>
        prev.map((entry) =>
          entry.lineId === line.lineId
            ? {
                ...fabricItem,
                lineId: entry.lineId,
                garment_type: lineEditForm.garment_type,
                label_count: labelCount,
                meters: String(meters),
              }
            : entry
        )
      );
      setEditingLineId(null);
      setLineEditForm(null);
      queueMicrotask(() => saveNow());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update fabric line.");
    } finally {
      setSavingLineEdit(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!clientId) {
      setError("Select a production brand and client.");
      return;
    }
    if (!productionBrandId) {
      setError("Select a production brand.");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one fabric.");
      return;
    }
    if (!deliveryDestination) {
      setError("Select a fabric delivery destination (Riyadh or Dubai).");
      return;
    }

    let fabric_lines;
    try {
      fabric_lines = lines.map((line) => {
        const quantity = Number(line.meters);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error(`Enter meters for fabric ${line.fabric_number}.`);
        }
        if (!line.garment_type) {
          throw new Error(`Select garment type for fabric ${line.fabric_number}.`);
        }
        return {
          garment_type: line.garment_type,
          label_count: line.label_count,
          supplier_id: line.supplier_id,
          supplier_name: line.supplier_name,
          fabric_number: line.fabric_number,
          quantity,
          unit: line.unit,
          unit_price: line.unit_price ?? 0,
          composition: line.composition,
          weight_gsm: line.weight_gsm,
          width_cm: line.width_cm,
          width_inches: line.width_inches,
          color: line.color,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid fabric lines.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sales-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          delivery_destination: deliveryDestination,
          delivery_date: deliveryDate || null,
          notes: notes || null,
          fabric_lines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create sales order");
      clearDraft();
      router.push(`/orders/${data.order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sales order");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {draftRestored && draftHydrated && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          <p>Restored your unsaved order draft — fabrics and client selection are back.</p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={discardDraft}>
              Discard draft
            </Button>
            <button
              type="button"
              onClick={dismissRestore}
              className="rounded p-1 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-700"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <AutoSaveStatusBar
            status={draftStatus}
            error={draftError}
            isDirty={draftDirty}
            variant="local"
          />
          {draftDirty && (
            <Button variant="secondary" size="sm" onClick={saveNow}>
              Save draft now
            </Button>
          )}
        </div>
        {draftDirty && (
          <Button variant="ghost" size="sm" onClick={discardDraft} className="text-slate-500">
            Discard draft
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        {brandFilterHydrated && (
          <FactoryBrandTabs
            value={productionBrandId}
            onChange={handleProductionBrandChange}
            label="Production brand"
          />
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Client</span>
            <ClientSearchSelect
              clients={clients}
              value={clientId}
              onChange={handleClientChange}
              brandId={productionBrandId}
              className="mt-1"
            />
            {selectedClient && (
              <span className="mt-1 block text-xs text-slate-500">
                {formatClientDisplayName(selectedClient)} · Client code {selectedClient.code} will be used on supplier
                emails.
              </span>
            )}
          </label>
          <div className="md:col-span-2">
            <DeliveryDestinationTabs value={deliveryDestination} onChange={setDeliveryDestination} />
          </div>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Delivery date</span>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Optional order notes"
            />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Fabrics for this order</h2>
          <p className="mt-1 text-sm text-slate-500">
            1) Pick fabric · 2) Garment type, factory labels & meters · 3) Add to order
          </p>
        </div>

        {!productionBrandId ? (
          <p className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
            Select a production brand, then choose a client.
          </p>
        ) : !selectedClient ? (
          <p className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
            Search and select a client for this brand.
          </p>
        ) : (
          <>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Fabric brand</span>
              <select
                value={selectedFabricBrandId}
                onChange={(e) => handleFabricBrandChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 md:max-w-sm"
              >
                <option value="">Select fabric brand…</option>
                {fabricBrands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                    {brand.has_price_list === false ? " (manual entry)" : ""}
                  </option>
                ))}
              </select>
            </label>

            {selectedFabricBrand && (
              <div className="space-y-6 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Step 1 · Fabric</p>
                  <div className="mt-3 space-y-3">
                    <FabricPicker
                      brandName={selectedFabricBrand.name}
                      supplierId={selectedFabricBrandId}
                      value={fabricPickerValue}
                      onChange={setFabricPickerValue}
                      onSelect={selectFabric}
                    />
                    {!pendingFabric && (
                      <p className="text-xs text-slate-500">
                        Type a fabric number and press <span className="font-medium">Enter</span> — then fill in labels
                        and meters below.
                      </p>
                    )}
                  </div>
                </div>

                <div className={pendingFabric ? "" : "opacity-60"}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                    Step 2 · Garment, labels & meters
                  </p>
                  {!pendingFabric ? (
                    <p className="mt-2 text-sm text-slate-500">Select a fabric above first.</p>
                  ) : (
                    <div className="mt-3 space-y-4">
                      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Selected fabric</p>
                        <p className="mt-1 font-mono font-medium text-slate-900">{pendingFabric.fabric_number}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{selectedFabricBrand.name}</p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-3">
                        <label className="block text-sm">
                          <span className="font-medium text-slate-700">Garment to stitch</span>
                          <select
                            value={garmentType}
                            onChange={(e) => {
                              const next = e.target.value;
                              setGarmentType(next);
                              if (next) setDraftLabelCount(String(getLabelCountForGarment(next)));
                            }}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                          >
                            <option value="">Select garment type…</option>
                            {GARMENT_STITCH_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm">
                          <span className="font-medium text-slate-700">Factory labels</span>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={draftLabelCount}
                            onChange={(e) => setDraftLabelCount(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                          />
                          <span className="mt-1 block text-xs text-slate-500">
                            Pieces to track (e.g. suit = 2 labels).
                          </span>
                        </label>
                        <label className="block text-sm">
                          <span className="font-medium text-slate-700">Meters to order</span>
                          <input
                            type="number"
                            min={0.1}
                            step={0.1}
                            value={draftMeters}
                            onChange={(e) => setDraftMeters(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                            placeholder="e.g. 3.5"
                          />
                        </label>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button onClick={addLine} disabled={!garmentType || !draftMeters || !draftLabelCount}>
                          Add to order
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setPendingFabric(null);
                            setGarmentType("");
                            setDraftMeters("");
                            setFabricPickerValue("");
                          }}
                        >
                          Clear fabric
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {lines.length > 0 && (
          <div className="space-y-4">
            {[...linesByFabricBrand.entries()].map(([supplierId, group]) => (
              <div key={supplierId} className="overflow-x-auto rounded-lg border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
                  <h3 className="text-sm font-semibold text-slate-900">{group.name}</h3>
                </div>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-white text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Fabric</th>
                      <th className="px-3 py-2">Garment</th>
                      <th className="px-3 py-2">Labels</th>
                      <th className="px-3 py-2">Composition</th>
                      <th className="px-3 py-2">Weight</th>
                      <th className="px-3 py-2">Width</th>
                      <th className="px-3 py-2">Price</th>
                      <th className="px-3 py-2">Meters</th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {group.lines.map((line) => {
                      const isEditing = editingLineId === line.lineId;
                      return (
                      <tr key={line.lineId} className="border-b border-slate-100 last:border-0 bg-white">
                        {isEditing && lineEditForm ? (
                          <td colSpan={9} className="px-3 py-4">
                            <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
                              <p className="text-sm font-medium text-slate-900">Edit fabric line</p>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <label className="block text-sm">
                                  <span className="font-medium text-slate-700">Fabric number</span>
                                  <input
                                    value={lineEditForm.fabric_number}
                                    onChange={(e) =>
                                      setLineEditForm((prev) =>
                                        prev ? { ...prev, fabric_number: e.target.value } : prev
                                      )
                                    }
                                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
                                  />
                                </label>
                                <label className="block text-sm">
                                  <span className="font-medium text-slate-700">Garment</span>
                                  <select
                                    value={lineEditForm.garment_type}
                                    onChange={(e) =>
                                      setLineEditForm((prev) =>
                                        prev ? { ...prev, garment_type: e.target.value } : prev
                                      )
                                    }
                                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                  >
                                    <option value="">Select garment type…</option>
                                    {GARMENT_STITCH_TYPES.map((type) => (
                                      <option key={type} value={type}>
                                        {type}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block text-sm">
                                  <span className="font-medium text-slate-700">Labels</span>
                                  <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={lineEditForm.label_count}
                                    onChange={(e) =>
                                      setLineEditForm((prev) =>
                                        prev ? { ...prev, label_count: e.target.value } : prev
                                      )
                                    }
                                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                  />
                                </label>
                                <label className="block text-sm">
                                  <span className="font-medium text-slate-700">Meters</span>
                                  <input
                                    type="number"
                                    min={0.1}
                                    step={0.1}
                                    value={lineEditForm.meters}
                                    onChange={(e) =>
                                      setLineEditForm((prev) =>
                                        prev ? { ...prev, meters: e.target.value } : prev
                                      )
                                    }
                                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                  />
                                </label>
                              </div>
                              <p className="mt-2 text-xs text-slate-500">
                                Changing the fabric number re-loads specs and price from the price list when available.
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => saveEditLine(line)}
                                  disabled={savingLineEdit}
                                >
                                  {savingLineEdit ? "Saving…" : "Save line"}
                                </Button>
                                <Button variant="secondary" size="sm" onClick={cancelEditLine} disabled={savingLineEdit}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          </td>
                        ) : (
                          <>
                        <td className="px-3 py-2 font-mono font-medium text-slate-900">
                          {line.fabric_number}
                          {line.manual ? (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-sans font-medium uppercase tracking-wide text-amber-800">
                              Manual
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{line.garment_type}</td>
                        <td className="px-3 py-2 text-slate-600">{line.label_count}</td>
                        <td className="px-3 py-2 text-slate-600">{line.composition ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{formatWeight(line.weight_gsm)}</td>
                        <td className="px-3 py-2 text-slate-600">{formatWidth(line)}</td>
                        <td className="px-3 py-2 text-slate-600">
                          <DualCurrencyPrice
                            amount={line.unit_price}
                            supplierId={line.supplier_id}
                            unit={line.unit}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0.1}
                            step={0.1}
                            value={line.meters}
                            onChange={(e) => updateMeters(line.lineId, e.target.value)}
                            className="w-24 rounded-lg border border-slate-300 px-2 py-1.5"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => startEditLine(line)} title="Edit line">
                              <Pencil className="h-4 w-4 text-slate-400" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => removeLine(line.lineId)} title="Remove line">
                              <Trash2 className="h-4 w-4 text-slate-400" />
                            </Button>
                          </div>
                        </td>
                          </>
                        )}
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {selectedClient && lines.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
            No fabrics added yet.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => router.push("/orders")}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={submitting || !productionBrandId || !clientId || lines.length === 0}>
          {submitting ? "Creating…" : "Create sales order"}
        </Button>
      </div>
    </div>
  );
}
