"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { FabricPicker } from "@/components/fabric/FabricPicker";
import { Button } from "@/components/ui/Button";
import { AutoSaveStatusBar } from "@/components/ui/AutoSaveStatus";
import { GARMENT_STITCH_TYPES, getLabelCountForGarment } from "@/lib/sales-orders/garment-types";
import { FactoryBrandTabs } from "@/components/brands/FactoryBrandTabs";
import { ClientSearchSelect } from "@/components/clients/ClientSearchSelect";
import { filterPersonClients } from "@/lib/clients/filter";
import { formatClientDisplayName } from "@/lib/clients/names";
import { useFactoryBrandFilter } from "@/hooks/useFactoryBrandFilter";
import { useLocalDraft } from "@/hooks/useLocalDraft";
import { useServerOrderDraft } from "@/hooks/useServerOrderDraft";
import { DRAFT_KEYS } from "@/lib/autosave/draft-keys";
import { readLocalDraft } from "@/lib/autosave/local-draft-storage";
import type { FabricSearchItem } from "@/lib/autosave/fabric-search-item";
import {
  normalizeLoroPianaFabricNumber,
  resolveLoroPianaFabricInput,
} from "@/lib/fabric-sourcing/loro-piana-styles";
import { resolveFabricItem } from "@/lib/fabric-sourcing/resolve-fabric-item";
import {
  fabricSupplierGroupKey,
  formatFabricSupplierName,
  normalizeFabricSupplierFields,
} from "@/lib/fabric-sourcing/supplier-display";
import { formatFabricStockLabel, isFabricUnavailable } from "@/lib/fabric-sourcing/fabric-stock";
import {
  FabricReplacementBadge,
  FabricStockBadge,
  lineNeedsAvailabilityAttention,
} from "@/components/fabric/FabricStockBadge";
import {
  countDraftFabricLines,
  describeSalesOrderDraftSummary,
  isSalesOrderDraftEmpty,
  migrateSalesOrderDraft,
  SALES_ORDER_DRAFT_VERSION,
  type SalesOrderFormDraft,
  type SalesOrderLineDraft,
} from "@/lib/autosave/sales-order-draft";
import {
  clientDraftTabLabel,
  clientIdTabLabel,
  createClientDraft,
  createFabricAddEntry,
  type FabricAddClientEntry,
  type SalesOrderClientDraft,
} from "@/lib/sales-orders/multi-client-draft";
import type { ClientProfile, ClientsFile } from "@/lib/types/clients";
import { DualCurrencyPrice } from "@/components/currency/DualCurrencyPrice";
import { DeliveryDestinationTabs } from "@/components/shipping/DeliveryDestinationTabs";
import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";
import {
  salesOrderToDuplicateSeed,
  type SalesOrderDuplicateSeed,
} from "@/lib/sales-orders/duplicate-draft";
import { fabricOrderUiLabels } from "@/lib/orders/fabric-order-ui-labels";
import { ordersUiLabels } from "@/lib/orders/ui-labels";
import type { SalesOrder } from "@/lib/types/sales-orders";

type FabricBrand = { id: string; name: string; has_price_list?: boolean };

type DraftLine = SalesOrderLineDraft;

type LineEditForm = {
  fabric_number: string;
  garment_type: string;
  label_count: string;
  meters: string;
};

function formatWidth(line: { width_cm?: number | null; width_inches?: number | null }) {
  if (line.width_cm != null) return `${line.width_cm} cm`;
  if (line.width_inches != null) return `${line.width_inches}"`;
  return "—";
}

function formatWeight(weight_gsm: number | null | undefined) {
  if (weight_gsm != null) return `${weight_gsm} gsm`;
  return "—";
}

export function SalesOrderForm({
  duplicateFromOrderId,
  startFresh = false,
  continueDraft = false,
  productionMode = false,
  fabricOrderLabels,
  redirectBasePath = "/orders",
}: {
  duplicateFromOrderId?: string;
  startFresh?: boolean;
  continueDraft?: boolean;
  productionMode?: boolean;
  /** When set, use Fabric Orders submit copy (`true` = QC, `false` = admin). */
  fabricOrderLabels?: boolean;
  /** Where to send the user after create / cancel — `/orders` or `/fabric-orders`. */
  redirectBasePath?: string;
} = {}) {
  const labels = ordersUiLabels(productionMode);
  const fabricLabels =
    fabricOrderLabels === undefined ? null : fabricOrderUiLabels(fabricOrderLabels);
  const router = useRouter();
  const duplicateModeRef = useRef(Boolean(duplicateFromOrderId));
  const duplicateSeedRef = useRef<SalesOrderDuplicateSeed | null>(null);
  const duplicateSeedAppliedRef = useRef(false);
  const [duplicateSource, setDuplicateSource] = useState<{
    id: string;
    so_number: string;
    client_name: string;
  } | null>(null);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [fabricBrands, setFabricBrands] = useState<FabricBrand[]>([]);
  const [canViewFabricPrices, setCanViewFabricPrices] = useState(false);
  const { brandId: productionBrandId, setBrandId: setProductionBrandId, hydrated: brandFilterHydrated } =
    useFactoryBrandFilter();
  const initialClientDraftRef = useRef(createClientDraft());
  const [clientDrafts, setClientDrafts] = useState<SalesOrderClientDraft[]>(() => [initialClientDraftRef.current]);
  const [activeDraftId, setActiveDraftId] = useState(() => initialClientDraftRef.current.id);

  const activeDraft =
    clientDrafts.find((draft) => draft.id === activeDraftId) ?? clientDrafts[0] ?? createClientDraft();
  const clientId = activeDraft.clientId;
  const deliveryDestination = activeDraft.deliveryDestination;
  const deliveryDate = activeDraft.deliveryDate;
  const notes = activeDraft.notes;
  const lines = activeDraft.lines;

  const [selectedFabricBrandId, setSelectedFabricBrandId] = useState("");
  const [fabricPickerValue, setFabricPickerValue] = useState("");
  const [pendingFabric, setPendingFabric] = useState<FabricSearchItem | null>(null);
  const [fabricAddEntries, setFabricAddEntries] = useState<FabricAddClientEntry[]>([]);
  const [activeFabricAddId, setActiveFabricAddId] = useState("");

  const activeFabricAdd =
    fabricAddEntries.find((entry) => entry.id === activeFabricAddId) ?? fabricAddEntries[0];
  const garmentType = activeFabricAdd?.garmentType ?? "";
  const draftLabelCount = activeFabricAdd?.labelCount ?? "1";
  const draftMeters = activeFabricAdd?.meters ?? "";

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lineEditForm, setLineEditForm] = useState<LineEditForm | null>(null);
  const [savingLineEdit, setSavingLineEdit] = useState(false);
  const skipClientResetRef = useRef(false);
  const flushServerDraftAfterMutationRef = useRef(false);
  const [draftChoiceResolved, setDraftChoiceResolved] = useState(
    () => Boolean(duplicateFromOrderId || startFresh || continueDraft)
  );

  function patchActiveDraft(patch: Partial<SalesOrderClientDraft>) {
    setClientDrafts((prev) =>
      prev.map((draft) => (draft.id === activeDraftId ? { ...draft, ...patch } : draft))
    );
  }

  function updateActiveLines(updater: (current: DraftLine[]) => DraftLine[]) {
    setClientDrafts((prev) =>
      prev.map((draft) =>
        draft.id === activeDraftId ? { ...draft, lines: updater(draft.lines) } : draft
      )
    );
  }

  function patchActiveFabricAdd(patch: Partial<FabricAddClientEntry>) {
    if (!activeFabricAddId) return;
    setFabricAddEntries((prev) =>
      prev.map((entry) => (entry.id === activeFabricAddId ? { ...entry, ...patch } : entry))
    );
  }

  function resetFabricAddEntries(defaultClientId = "") {
    const entry = createFabricAddEntry({ clientId: defaultClientId });
    setFabricAddEntries([entry]);
    setActiveFabricAddId(entry.id);
  }

  function clearFabricAddEntries() {
    setFabricAddEntries([]);
    setActiveFabricAddId("");
  }

  function resetClientDrafts() {
    const draft = createClientDraft();
    setClientDrafts([draft]);
    setActiveDraftId(draft.id);
  }

  const draftSnapshot = useMemo(
    (): SalesOrderFormDraft => ({
      version: SALES_ORDER_DRAFT_VERSION,
      savedAt: new Date().toISOString(),
      productionBrandId,
      activeClientDraftId: activeDraftId,
      clientDrafts,
      selectedFabricBrandId,
      fabricPickerValue,
      pendingFabric,
      garmentType,
      draftLabelCount,
      draftMeters,
    }),
    [
      productionBrandId,
      activeDraftId,
      clientDrafts,
      selectedFabricBrandId,
      fabricPickerValue,
      pendingFabric,
      garmentType,
      draftLabelCount,
      draftMeters,
    ]
  );

  const restoreDraft = useCallback(
    (raw: unknown) => {
      const draft = migrateSalesOrderDraft(raw);
      if (!draft || isSalesOrderDraftEmpty(draft)) return;
      skipClientResetRef.current = true;
      setProductionBrandId(draft.productionBrandId);
      const restoredDrafts =
        draft.clientDrafts.length > 0 ? draft.clientDrafts : [createClientDraft()];
      setClientDrafts(restoredDrafts);
      setActiveDraftId(
        restoredDrafts.some((entry) => entry.id === draft.activeClientDraftId)
          ? draft.activeClientDraftId
          : restoredDrafts[0]!.id
      );
      setSelectedFabricBrandId(draft.selectedFabricBrandId);
      setFabricPickerValue(draft.fabricPickerValue);
      setPendingFabric(draft.pendingFabric);
      if (draft.pendingFabric) {
        const defaultClientId =
          restoredDrafts.find((entry) => entry.id === draft.activeClientDraftId)?.clientId ??
          restoredDrafts[0]?.clientId ??
          "";
        const entry = createFabricAddEntry({
          clientId: defaultClientId,
          garmentType: draft.garmentType,
          labelCount: draft.draftLabelCount,
          meters: draft.draftMeters,
        });
        setFabricAddEntries([entry]);
        setActiveFabricAddId(entry.id);
      } else {
        clearFabricAddEntries();
      }
      queueMicrotask(() => {
        skipClientResetRef.current = false;
      });
    },
    [setProductionBrandId]
  );

  const draftKey = duplicateFromOrderId
    ? DRAFT_KEYS.salesOrderDuplicate(duplicateFromOrderId)
    : redirectBasePath === "/fabric-orders"
      ? DRAFT_KEYS.fabricOrderNew
      : DRAFT_KEYS.salesOrderNew;

  const promptForDraft = !duplicateFromOrderId;

  const {
    status: draftStatus,
    error: draftError,
    restored: draftRestored,
    hydrated: draftHydrated,
    hasPendingRestore,
    pendingDraft,
    isDirty: draftDirty,
    clearDraft,
    restorePending,
    dismissPendingRestore,
    saveNow,
  } = useLocalDraft({
    draftKey,
    value: draftSnapshot,
    enabled: !loading && brandFilterHydrated,
    canSave: true,
    isEmpty: isSalesOrderDraftEmpty,
    onRestore: restoreDraft,
    autoRestore: !promptForDraft,
  });

  const serverDraftEnabled = !duplicateFromOrderId;
  const serverDraftApiPath =
    redirectBasePath === "/fabric-orders" ? "/api/fabric-order-drafts" : "/api/sales-order-drafts";
  const {
    status: serverDraftStatus,
    error: serverDraftError,
    savedAt: serverDraftSavedAt,
    hydrated: serverDraftHydrated,
    hasPendingRestore: hasPendingServerRestore,
    pendingDraft: pendingServerDraft,
    persistNow: persistServerDraft,
    flushKeepalive: flushServerDraftKeepalive,
    clearServerDraft,
    dismissPendingRestore: dismissPendingServerRestore,
  } = useServerOrderDraft({
    enabled: serverDraftEnabled,
    draft: draftSnapshot,
    apiPath: serverDraftApiPath,
    readyToSave: draftChoiceResolved && !loading,
  });

  function resolveDraftForServerSave(): SalesOrderFormDraft {
    const stored = readLocalDraft<SalesOrderFormDraft>(draftKey);
    const migrated = stored ? migrateSalesOrderDraft(stored) : null;
    if (migrated && !isSalesOrderDraftEmpty(migrated)) {
      const storedLines = countDraftFabricLines(migrated);
      const snapshotLines = countDraftFabricLines(draftSnapshot);
      if (storedLines >= snapshotLines) {
        return migrated;
      }
    }
    return draftSnapshot;
  }

  function saveDraftNow() {
    saveNow();
    if (serverDraftEnabled) {
      void persistServerDraft(resolveDraftForServerSave());
    }
  }

  function requestServerDraftSaveAfterMutation() {
    flushServerDraftAfterMutationRef.current = true;
  }

  useEffect(() => {
    if (!flushServerDraftAfterMutationRef.current) return;
    if (!serverDraftEnabled || !serverDraftHydrated) return;
    flushServerDraftAfterMutationRef.current = false;
    saveNow();
    void persistServerDraft(resolveDraftForServerSave());
  }, [draftSnapshot, persistServerDraft, saveNow, serverDraftEnabled, serverDraftHydrated]);

  const serverDraftSummary = useMemo(
    () => (pendingServerDraft ? describeSalesOrderDraftSummary(pendingServerDraft, clients) : null),
    [clients, pendingServerDraft]
  );

  const draftSummary = useMemo(
    () => (pendingDraft ? describeSalesOrderDraftSummary(pendingDraft, clients) : null),
    [clients, pendingDraft]
  );

  useEffect(() => {
    if (loading || !draftHydrated || !serverDraftHydrated || draftChoiceResolved || !promptForDraft) return;

    if (startFresh && (hasPendingRestore || hasPendingServerRestore)) {
      clearDraft();
      if (serverDraftEnabled) {
        void clearServerDraft();
      }
      resetClientDrafts();
      dismissPendingRestore();
      dismissPendingServerRestore();
      setDraftChoiceResolved(true);
      return;
    }

    if (continueDraft && hasPendingRestore) {
      restorePending();
      setDraftChoiceResolved(true);
      return;
    }

    if (continueDraft && hasPendingServerRestore && pendingServerDraft) {
      restoreDraft(pendingServerDraft);
      dismissPendingServerRestore();
      setDraftChoiceResolved(true);
      return;
    }

    // Fabric Orders: restore pending drafts without making users discover /new first.
    if (redirectBasePath === "/fabric-orders" && !startFresh && hasPendingRestore) {
      restorePending();
      setDraftChoiceResolved(true);
      return;
    }

    if (hasPendingServerRestore && !hasPendingRestore && pendingServerDraft) {
      restoreDraft(pendingServerDraft);
      dismissPendingServerRestore();
      setDraftChoiceResolved(true);
      return;
    }

    if (!hasPendingRestore && !hasPendingServerRestore) {
      setDraftChoiceResolved(true);
    }
  }, [
    clearDraft,
    clearServerDraft,
    continueDraft,
    dismissPendingRestore,
    dismissPendingServerRestore,
    draftChoiceResolved,
    draftHydrated,
    hasPendingRestore,
    hasPendingServerRestore,
    loading,
    pendingServerDraft,
    promptForDraft,
    redirectBasePath,
    restoreDraft,
    restorePending,
    serverDraftEnabled,
    serverDraftHydrated,
    startFresh,
  ]);

  function continueSavedDraft() {
    restorePending();
    setDraftChoiceResolved(true);
  }

  function continueServerSavedDraft() {
    if (pendingServerDraft) {
      restoreDraft(pendingServerDraft);
      dismissPendingServerRestore();
      setDraftChoiceResolved(true);
    }
  }

  function startBlankOrder() {
    clearDraft();
    if (serverDraftEnabled) {
      void clearServerDraft();
    }
    resetClientDrafts();
    resetAddFlow();
    setProductionBrandId(null);
    dismissPendingRestore();
    setDraftChoiceResolved(true);
    setError(null);
  }

  function applyDuplicateSeed(seed: SalesOrderDuplicateSeed) {
    skipClientResetRef.current = true;
    duplicateModeRef.current = true;
    const draft = createClientDraft({
      deliveryDestination: seed.deliveryDestination,
      deliveryDate: seed.deliveryDate,
      notes: seed.notes,
      lines: seed.lines,
    });
    setClientDrafts([draft]);
    setActiveDraftId(draft.id);
    resetAddFlow();
    setError(null);
    queueMicrotask(() => {
      skipClientResetRef.current = false;
    });
  }

  function discardDraft() {
    clearDraft();
    if (serverDraftEnabled) {
      void clearServerDraft();
    }
    setProductionBrandId(null);
    resetClientDrafts();
    resetAddFlow();
    setError(null);
    if (duplicateFromOrderId && duplicateSeedRef.current) {
      duplicateSeedAppliedRef.current = true;
      applyDuplicateSeed(duplicateSeedRef.current);
    }
  }

  const totalFabricLines = useMemo(
    () => clientDrafts.reduce((sum, draft) => sum + draft.lines.length, 0),
    [clientDrafts]
  );
  const hasUnsavedFabricLines = totalFabricLines > 0;
  const healLocalDraftToServerRef = useRef(false);

  /** Push local draft lines to Supabase when browser has fabrics the server missed. */
  useEffect(() => {
    if (!serverDraftEnabled || !serverDraftHydrated || !draftHydrated || !draftChoiceResolved || loading) {
      return;
    }
    if (healLocalDraftToServerRef.current) return;

    const stored = readLocalDraft<SalesOrderFormDraft>(draftKey);
    const migrated = stored ? migrateSalesOrderDraft(stored) : null;
    if (!migrated || isSalesOrderDraftEmpty(migrated)) return;

    const storedLines = countDraftFabricLines(migrated);
    if (storedLines === 0 && totalFabricLines === 0) return;

    healLocalDraftToServerRef.current = true;
    void persistServerDraft(migrated);
  }, [
    draftChoiceResolved,
    draftHydrated,
    draftKey,
    loading,
    persistServerDraft,
    serverDraftEnabled,
    serverDraftHydrated,
    totalFabricLines,
  ]);

  const serverDraftAutoSaveStatus = useMemo(() => {
    if (serverDraftStatus === "saving") return "saving" as const;
    if (serverDraftStatus === "saved") return "saved" as const;
    if (serverDraftStatus === "error") return "error" as const;
    if (serverDraftSavedAt && !isSalesOrderDraftEmpty(draftSnapshot)) return "idle" as const;
    if (!isSalesOrderDraftEmpty(draftSnapshot)) return "pending" as const;
    return "idle" as const;
  }, [draftSnapshot, serverDraftSavedAt, serverDraftStatus]);

  useEffect(() => {
    if (!hasUnsavedFabricLines) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      saveNow();
      if (serverDraftEnabled) {
        flushServerDraftKeepalive();
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [flushServerDraftKeepalive, hasUnsavedFabricLines, saveNow, serverDraftEnabled]);

  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) return;
        const data = (await res.json()) as { can_view_fabric_list_prices?: boolean };
        setCanViewFabricPrices(Boolean(data.can_view_fabric_list_prices));
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
        const fetches: Promise<Response>[] = [fetch("/api/clients"), fetch("/api/fabric-brands")];
        if (duplicateFromOrderId) {
          fetches.push(fetch(`/api/sales-orders/${duplicateFromOrderId}`));
        }
        const responses = await Promise.all(fetches);
        const [clientsRes, brandsRes, duplicateRes] = responses;

        if (!clientsRes.ok) throw new Error("Failed to load clients");
        const clientsData = (await clientsRes.json()) as ClientsFile;
        setClients(filterPersonClients(clientsData.clients.filter((client) => client.is_active)));

        if (brandsRes.ok) {
          const brandsData = (await brandsRes.json()) as { brands: FabricBrand[] };
          const brands = brandsData.brands ?? [];
          setFabricBrands(brands);
          if (brands.length === 0) {
            setError("No fabric suppliers loaded — refresh the page or contact admin.");
          }
        } else {
          setError("Failed to load fabric suppliers — refresh the page.");
        }

        if (duplicateFromOrderId) {
          if (!duplicateRes?.ok) {
            throw new Error("Could not load the source order to duplicate.");
          }
          const { order } = (await duplicateRes.json()) as { order: SalesOrder };
          duplicateSeedRef.current = salesOrderToDuplicateSeed(order);
          setDuplicateSource({
            id: order.id,
            so_number: order.so_number,
            client_name: order.client_name,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load form data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [duplicateFromOrderId]);

  useEffect(() => {
    if (!duplicateFromOrderId || !draftHydrated || duplicateSeedAppliedRef.current) return;
    duplicateSeedAppliedRef.current = true;

    if (draftRestored) return;

    const seed = duplicateSeedRef.current;
    if (!seed) return;
    applyDuplicateSeed(seed);
  }, [duplicateFromOrderId, draftHydrated, draftRestored]);

  const selectedClient = clients.find((client) => client.id === clientId);
  const selectedFabricBrand = fabricBrands.find((brand) => brand.id === selectedFabricBrandId) ?? null;

  const linesByFabricBrand = useMemo(() => {
    const groups = new Map<string, { name: string; lines: DraftLine[] }>();
    for (const line of lines) {
      const key = fabricSupplierGroupKey(line.supplier_id, line.fabric_number);
      const bucket = groups.get(key) ?? {
        name: formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number),
        lines: [],
      };
      bucket.lines.push(line);
      groups.set(key, bucket);
    }
    return groups;
  }, [lines]);

  const readyDrafts = useMemo(
    () => clientDrafts.filter((draft) => draft.clientId && draft.lines.length > 0),
    [clientDrafts]
  );

  const submitButtonLabel = fabricLabels
    ? fabricLabels.submitButton
    : readyDrafts.length > 1
      ? labels.createMany(readyDrafts.length)
      : labels.createOne;

  function resetAddFlow() {
    setSelectedFabricBrandId("");
    setFabricPickerValue("");
    setPendingFabric(null);
    clearFabricAddEntries();
  }

  function handleProductionBrandChange(nextBrandId: string | null) {
    setProductionBrandId(nextBrandId);
    if (skipClientResetRef.current || duplicateModeRef.current) return;
    resetClientDrafts();
    resetAddFlow();
    setError(null);
  }

  function handleClientChange(nextClientId: string) {
    patchActiveDraft({ clientId: nextClientId });
    setError(null);
  }

  function switchClientDraft(nextDraftId: string) {
    if (nextDraftId === activeDraftId) return;
    setEditingLineId(null);
    setLineEditForm(null);
    setActiveDraftId(nextDraftId);
    resetAddFlow();
    setError(null);
  }

  function addFabricAddClient() {
    const source = fabricAddEntries.find((entry) => entry.id === activeFabricAddId) ?? fabricAddEntries[0];
    if (!source?.garmentType) {
      setError("Select garment type first — it will be copied to the new client tab.");
      return;
    }
    const entry = createFabricAddEntry({ clientId: "" }, source);
    setFabricAddEntries((prev) => [...prev, entry]);
    setActiveFabricAddId(entry.id);
    setError(null);
  }

  function removeFabricAddClient(entryId: string) {
    if (fabricAddEntries.length <= 1) return;
    const next = fabricAddEntries.filter((entry) => entry.id !== entryId);
    setFabricAddEntries(next);
    if (activeFabricAddId === entryId) {
      setActiveFabricAddId(next[0]!.id);
    }
  }

  function handleFabricBrandChange(nextBrandId: string) {
    setSelectedFabricBrandId(nextBrandId);
    setFabricPickerValue("");
    setPendingFabric(null);
    clearFabricAddEntries();
  }

  function selectFabric(item: FabricSearchItem) {
    setPendingFabric(item);
    resetFabricAddEntries(clientId);
    setFabricPickerValue(item.fabric_number);
  }

  function addLine() {
    if (!pendingFabric || fabricAddEntries.length === 0) return;

    const clientIds = fabricAddEntries.map((entry) => entry.clientId).filter(Boolean);
    if (new Set(clientIds).size !== clientIds.length) {
      setError("Each client tab must be a different client.");
      return;
    }

    for (const [index, entry] of fabricAddEntries.entries()) {
      if (!entry.clientId) {
        setError(`Select a client for tab ${index + 1}.`);
        setActiveFabricAddId(entry.id);
        return;
      }
      if (!entry.garmentType) {
        setError(`Select garment type for ${clientIdTabLabel(entry.clientId, index, clients)}.`);
        setActiveFabricAddId(entry.id);
        return;
      }
      const meters = Number(entry.meters);
      if (!Number.isFinite(meters) || meters <= 0) {
        setError(`Enter meters for ${clientIdTabLabel(entry.clientId, index, clients)}.`);
        setActiveFabricAddId(entry.id);
        return;
      }
      const labelCount = Number(entry.labelCount);
      if (!Number.isInteger(labelCount) || labelCount < 1) {
        setError(`Enter a valid label count for ${clientIdTabLabel(entry.clientId, index, clients)}.`);
        setActiveFabricAddId(entry.id);
        return;
      }
    }

    setError(null);
    const normalized = normalizeFabricSupplierFields(
      pendingFabric.supplier_id,
      pendingFabric.supplier_name,
      pendingFabric.fabric_number
    );
    const stamp = Date.now();

    setClientDrafts((prev) => {
      let next = [...prev];
      for (const [index, entry] of fabricAddEntries.entries()) {
        let draftIndex = next.findIndex((draft) => draft.clientId === entry.clientId);
        if (draftIndex < 0) {
          const source = next.find((draft) => draft.id === activeDraftId) ?? next[0];
          const newDraft = createClientDraft({
            clientId: entry.clientId,
            deliveryDestination: source?.deliveryDestination ?? "",
            deliveryDate: source?.deliveryDate ?? "",
          });
          next = [...next, newDraft];
          draftIndex = next.length - 1;
        }

        const labelCount = Number(entry.labelCount);
        const line: DraftLine = {
          ...pendingFabric,
          ...normalized,
          lineId: `line-${stamp}-${index}-${entry.clientId}-${pendingFabric.fabric_number}`,
          garment_type: entry.garmentType,
          label_count: labelCount,
          meters: String(Number(entry.meters)),
          stock_status: pendingFabric.stock_status ?? null,
          restock_date: pendingFabric.restock_date ?? null,
          needs_replacement: pendingFabric.stock_status === "permanently_unavailable",
        };
        const draft = next[draftIndex]!;
        next[draftIndex] = { ...draft, lines: [...draft.lines, line] };
      }

      const focusClientId = fabricAddEntries[0]?.clientId;
      const focusDraft = focusClientId ? next.find((draft) => draft.clientId === focusClientId) : undefined;
      if (focusDraft) {
        queueMicrotask(() => setActiveDraftId(focusDraft.id));
      }

      return next;
    });

    setPendingFabric(null);
    clearFabricAddEntries();
    setFabricPickerValue("");
    requestServerDraftSaveAfterMutation();
  }

  function removeClientDraft(draftId: string) {
    if (clientDrafts.length <= 1) return;
    const nextDrafts = clientDrafts.filter((draft) => draft.id !== draftId);
    setClientDrafts(nextDrafts);
    if (activeDraftId === draftId) {
      setActiveDraftId(nextDrafts[0]!.id);
      setEditingLineId(null);
      setLineEditForm(null);
      resetAddFlow();
    }
  }

  function markFindReplacement(lineId: string) {
    updateActiveLines((prev) =>
      prev.map((line) => (line.lineId === lineId ? { ...line, needs_replacement: true } : line))
    );
    setError(null);
  }

  function updateMeters(lineId: string, meters: string) {
    updateActiveLines((prev) => prev.map((line) => (line.lineId === lineId ? { ...line, meters } : line)));
  }

  function removeLine(lineId: string) {
    if (editingLineId === lineId) {
      setEditingLineId(null);
      setLineEditForm(null);
    }
    updateActiveLines((prev) => prev.filter((line) => line.lineId !== lineId));
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
      const normalized = normalizeFabricSupplierFields(
        fabricItem.supplier_id,
        fabricItem.supplier_name,
        nextFabricNumber
      );

      updateActiveLines((prev) =>
        prev.map((entry) =>
          entry.lineId === line.lineId
            ? {
                ...fabricItem,
                ...normalized,
                fabric_number: nextFabricNumber,
                lineId: entry.lineId,
                garment_type: lineEditForm.garment_type,
                label_count: labelCount,
                meters: String(meters),
                stock_status: fabricItem.stock_status ?? entry.stock_status ?? null,
                restock_date: fabricItem.restock_date ?? entry.restock_date ?? null,
                needs_replacement: isFabricUnavailable(fabricItem.stock_status)
                  ? entry.needs_replacement ?? true
                  : false,
              }
            : entry
        )
      );
      setEditingLineId(null);
      setLineEditForm(null);
      requestServerDraftSaveAfterMutation();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update fabric line.");
    } finally {
      setSavingLineEdit(false);
    }
  }

  function mapDraftLinesToPayload(draftLines: DraftLine[]) {
    return draftLines.map((line) => {
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
        ...normalizeFabricSupplierFields(line.supplier_id, line.supplier_name, line.fabric_number),
        fabric_number: line.fabric_number,
        quantity,
        unit: line.unit,
        unit_price: line.unit_price ?? 0,
        composition: line.composition,
        weight_gsm: line.weight_gsm,
        width_cm: line.width_cm,
        width_inches: line.width_inches,
        color: line.color,
        stock_status: line.stock_status ?? null,
        restock_date: line.restock_date ?? null,
        needs_replacement: Boolean(line.needs_replacement),
        replacement_fabric_number: line.replacement_fabric_number ?? null,
      };
    });
  }

  async function handleSubmit() {
    setError(null);
    if (!productionBrandId) {
      setError("Select a production brand.");
      return;
    }
    if (readyDrafts.length === 0) {
      setError("Select a client and add at least one fabric on at least one tab.");
      return;
    }

    const clientIds = readyDrafts.map((draft) => draft.clientId);
    if (new Set(clientIds).size !== clientIds.length) {
      setError("Each client tab must have a different client.");
      return;
    }

    const payloads: Array<{
      draftId: string;
      body: {
        client_id: string;
        delivery_destination: DeliveryDestination;
        delivery_date: string | null;
        notes: string | null;
        fabric_lines: ReturnType<typeof mapDraftLinesToPayload>;
      };
    }> = [];

    try {
      for (const draft of readyDrafts) {
        if (!draft.deliveryDestination) {
          setActiveDraftId(draft.id);
          throw new Error("Select a fabric delivery destination (Riyadh or Dubai) for each client.");
        }
        payloads.push({
          draftId: draft.id,
          body: {
            client_id: draft.clientId,
            delivery_destination: draft.deliveryDestination,
            delivery_date: draft.deliveryDate || null,
            notes: draft.notes || null,
            fabric_lines: mapDraftLinesToPayload(draft.lines),
          },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid fabric lines.");
      return;
    }

    setSubmitting(true);
    try {
      const createdOrderIds: string[] = [];
      for (const payload of payloads) {
        const res = await fetch("/api/sales-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload.body),
        });
        let data: { order?: { id: string }; error?: string };
        try {
          data = (await res.json()) as { order?: { id: string }; error?: string };
        } catch {
          throw new Error(
            res.ok
              ? "Invalid server response — the order may not have been saved. Try again."
              : `Save failed (${res.status}) — the order was not saved. Check your connection and try again.`
          );
        }
        if (!res.ok) {
          throw new Error(data.error ?? `Save failed (${res.status}) — the order was not saved.`);
        }
        if (!data.order?.id) {
          throw new Error("Save failed — server did not confirm the order. Try again.");
        }
        createdOrderIds.push(data.order.id);
      }
      clearDraft();
      if (serverDraftEnabled) {
        await clearServerDraft();
      }
      router.push(
        createdOrderIds.length === 1 ? `${redirectBasePath}/${createdOrderIds[0]}` : redirectBasePath
      );
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

  const showDraftChooser =
    promptForDraft &&
    !draftChoiceResolved &&
    draftHydrated &&
    serverDraftHydrated &&
    ((hasPendingRestore && draftSummary) || (hasPendingServerRestore && serverDraftSummary));

  if (showDraftChooser) {
    const activeSummary = hasPendingRestore && draftSummary ? draftSummary : serverDraftSummary!;
    const savedLabel = activeSummary.savedAt
      ? new Date(activeSummary.savedAt).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : null;
    const draftSource =
      hasPendingRestore && draftSummary ? "this browser" : "the server (works on any device)";

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Continue an unfinished order?</h2>
          <p className="mt-2 text-sm text-slate-600">
            You have a saved draft in {draftSource} that wasn&apos;t submitted yet. Continue where you left off, or
            start a blank order for a different client.
          </p>

          <div className="mt-6 rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Saved draft</p>
            {savedLabel && <p className="mt-1 text-xs text-slate-500">Last edited {savedLabel}</p>}
            <ul className="mt-3 space-y-2">
              {activeSummary.clientEntries.map((entry, index) => (
                <li key={`${entry.label}-${index}`} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-900">{entry.label}</span>
                  <span className="text-slate-500">
                    {entry.fabricCount} fabric{entry.fabricCount !== 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={hasPendingRestore && draftSummary ? continueSavedDraft : continueServerSavedDraft}
              className="flex-1"
            >
              Continue draft
            </Button>
            <Button variant="secondary" onClick={startBlankOrder} className="flex-1">
              Start new order
            </Button>
          </div>

          <div className="mt-4 flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => router.push(redirectBasePath)} className="text-slate-500">
              Back to orders list
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {duplicateSource && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
          <p>
            Copied from{" "}
            <span className="font-semibold">{duplicateSource.so_number}</span> ({duplicateSource.client_name}). Pick
            the new client below — all fabrics, garment types, and meters are editable before you save.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {hasUnsavedFabricLines && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div className="flex flex-wrap items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <p>
              <strong>Not saved yet.</strong> You have {totalFabricLines} fabric
              {totalFabricLines !== 1 ? "s" : ""} in this draft — drafts and server backup do not create an order.
              Click <strong>{submitButtonLabel}</strong> to save the order.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <AutoSaveStatusBar
            status={draftStatus}
            error={draftError}
            isDirty={draftDirty}
            variant="local"
          />
          {serverDraftEnabled && !isSalesOrderDraftEmpty(draftSnapshot) && (
            <>
              <AutoSaveStatusBar
                status={serverDraftAutoSaveStatus}
                error={serverDraftError}
                isDirty={serverDraftAutoSaveStatus === "pending"}
                variant="remote"
                waitingMessage="Waiting to back up to server…"
              />
              {serverDraftStatus === "error" && (
                <Button variant="secondary" size="sm" onClick={() => void persistServerDraft()}>
                  Retry server backup
                </Button>
              )}
            </>
          )}
          {draftDirty && (
            <Button variant="secondary" size="sm" onClick={saveDraftNow}>
              Save draft now
            </Button>
          )}
        </div>
        {serverDraftError && serverDraftStatus !== "error" && (
          <p className="text-xs text-amber-700">Server backup: {serverDraftError}</p>
        )}
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

        {productionBrandId && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {clientDrafts.map((draft, index) => {
                const isActive = draft.id === activeDraftId;
                const label = clientDraftTabLabel(draft, index, clients);
                return (
                  <div key={draft.id} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => switchClientDraft(draft.id)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {draft.lines.length} fabric{draft.lines.length !== 1 ? "s" : ""}
                      </span>
                    </button>
                    {clientDrafts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeClientDraft(draft.id)}
                        className="ml-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        aria-label={`Remove ${label}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">
              Switch tabs to review each client&apos;s fabrics. To add the same fabric for another client, use{" "}
              <span className="font-medium">Add client</span> under Step 2 when picking a fabric.
            </p>
          </div>
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
            <DeliveryDestinationTabs
              value={deliveryDestination}
              onChange={(value) => patchActiveDraft({ deliveryDestination: value })}
            />
          </div>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Delivery date</span>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => patchActiveDraft({ deliveryDate: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => patchActiveDraft({ notes: e.target.value })}
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
              <span className="font-medium text-slate-700">Fabric supplier</span>
              <select
                value={selectedFabricBrandId}
                onChange={(e) => handleFabricBrandChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 md:max-w-sm"
              >
                <option value="">Select fabric supplier…</option>
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
                      canViewFabricPrices={canViewFabricPrices}
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
                        <p className="mt-1 font-mono font-medium text-slate-900">
                          {pendingFabric.fabric_number}
                          <FabricStockBadge fabric={pendingFabric} />
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">{selectedFabricBrand.name}</p>
                      </div>

                      {isFabricUnavailable(pendingFabric.stock_status) && (
                        <div
                          className={`rounded-lg border px-4 py-3 text-sm ${
                            pendingFabric.stock_status === "permanently_unavailable"
                              ? "border-red-200 bg-red-50 text-red-900"
                              : "border-amber-200 bg-amber-50 text-amber-900"
                          }`}
                        >
                          <p className="font-medium">
                            {pendingFabric.stock_status === "permanently_unavailable"
                              ? "This fabric is out of stock."
                              : formatFabricStockLabel(pendingFabric) ?? "This fabric is temporarily unavailable."}
                          </p>
                          <p className="mt-1 text-xs opacity-90">
                            You can still add it with garment, labels & meters —{" "}
                            {pendingFabric.stock_status === "permanently_unavailable"
                              ? "it will be marked to find a replacement later."
                              : "use Find replacement on the line if you need a substitute now."}
                          </p>
                        </div>
                      )}

                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {fabricAddEntries.map((entry, index) => {
                            const isActive = entry.id === activeFabricAddId;
                            const label = clientIdTabLabel(entry.clientId, index, clients);
                            return (
                              <div key={entry.id} className="flex items-center">
                                <button
                                  type="button"
                                  onClick={() => setActiveFabricAddId(entry.id)}
                                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                                    isActive
                                      ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                  }`}
                                >
                                  {label}
                                </button>
                                {fabricAddEntries.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeFabricAddClient(entry.id)}
                                    className="ml-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                    aria-label={`Remove ${label}`}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {activeFabricAdd && (
                        <>
                          <label className="block text-sm">
                            <span className="font-medium text-slate-700">Client for this fabric</span>
                            <ClientSearchSelect
                              clients={clients}
                              value={activeFabricAdd.clientId}
                              onChange={(value) => patchActiveFabricAdd({ clientId: value })}
                              brandId={productionBrandId}
                              className="mt-1"
                            />
                          </label>

                          <div className="grid gap-4 sm:grid-cols-3">
                            <label className="block text-sm">
                              <span className="font-medium text-slate-700">Garment to stitch</span>
                              <select
                                value={activeFabricAdd.garmentType}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  patchActiveFabricAdd({
                                    garmentType: next,
                                    labelCount: next
                                      ? String(getLabelCountForGarment(next))
                                      : activeFabricAdd.labelCount,
                                  });
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
                                value={activeFabricAdd.labelCount}
                                onChange={(e) => patchActiveFabricAdd({ labelCount: e.target.value })}
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
                                value={activeFabricAdd.meters}
                                onChange={(e) => patchActiveFabricAdd({ meters: e.target.value })}
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                                placeholder="e.g. 3.5"
                              />
                            </label>
                          </div>
                        </>
                      )}

                      <div className="space-y-2 border-t border-slate-200 pt-4">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={addFabricAddClient}
                          className="gap-1.5"
                        >
                          <Plus className="h-4 w-4" />
                          Add client
                        </Button>
                        <p className="text-xs text-slate-500">
                          Same fabric for another client? Copies garment, labels & meters — pick the client and adjust
                          meters, then add to order.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={addLine}
                          disabled={
                            fabricAddEntries.length === 0 ||
                            fabricAddEntries.some(
                              (entry) => !entry.clientId || !entry.garmentType || !entry.meters || !entry.labelCount
                            )
                          }
                        >
                          {fabricAddEntries.length > 1
                            ? `Add to ${fabricAddEntries.length} clients' orders`
                            : "Add to order"}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setPendingFabric(null);
                            clearFabricAddEntries();
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
                      {canViewFabricPrices ? <th className="px-3 py-2">Price</th> : null}
                      <th className="px-3 py-2">Meters</th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {group.lines.map((line) => {
                      const isEditing = editingLineId === line.lineId;
                      return (
                      <tr
                        key={line.lineId}
                        className={
                          lineNeedsAvailabilityAttention(line)
                            ? "border-b border-slate-100 last:border-0 bg-amber-50/40"
                            : "border-b border-slate-100 last:border-0 bg-white"
                        }
                      >
                        {isEditing && lineEditForm ? (
                          <td colSpan={canViewFabricPrices ? 9 : 8} className="px-3 py-4">
                            <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
                              <p className="text-sm font-medium text-slate-900">
                                {line.needs_replacement ? "Pick replacement fabric" : "Edit fabric line"}
                              </p>
                              {line.needs_replacement && (
                                <p className="mt-1 text-xs text-violet-800">
                                  Original {line.fabric_number} is unavailable — search for a substitute. Garment, labels
                                  & meters stay the same.
                                </p>
                              )}
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
                          <FabricStockBadge fabric={line} />
                          <FabricReplacementBadge needsReplacement={line.needs_replacement} />
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
                        {canViewFabricPrices ? (
                          <td className="px-3 py-2 text-slate-600">
                            <DualCurrencyPrice
                              amount={line.unit_price}
                              supplierId={line.supplier_id}
                              unit={line.unit}
                            />
                          </td>
                        ) : null}
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
                          <div className="flex flex-col items-end gap-1">
                            {isFabricUnavailable(line.stock_status) && (
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={() =>
                                  line.needs_replacement ? startEditLine(line) : markFindReplacement(line.lineId)
                                }
                              >
                                <Search className="h-3.5 w-3.5" />
                                {line.needs_replacement ? "Pick replacement" : "Find replacement"}
                              </Button>
                            )}
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => startEditLine(line)} title="Edit line">
                                <Pencil className="h-4 w-4 text-slate-400" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => removeLine(line.lineId)} title="Remove line">
                                <Trash2 className="h-4 w-4 text-slate-400" />
                              </Button>
                            </div>
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
        <Button variant="secondary" onClick={() => router.push(redirectBasePath)}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || !productionBrandId || readyDrafts.length === 0}
        >
          {submitting ? "Creating…" : submitButtonLabel}
        </Button>
      </div>
    </div>
  );
}
