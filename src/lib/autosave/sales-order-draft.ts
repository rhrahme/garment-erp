import { DRAFT_KEYS } from "@/lib/autosave/draft-keys";
import type { FabricSearchItem } from "@/lib/autosave/fabric-search-item";
import { readLocalDraft } from "@/lib/autosave/local-draft-storage";
import type { SalesOrderClientDraft } from "@/lib/sales-orders/multi-client-draft";

export const SALES_ORDER_DRAFT_VERSION = 3;

import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";

export type SalesOrderLineDraft = FabricSearchItem & {
  lineId: string;
  garment_type: string;
  label_count: number;
  meters: string;
  /** User flagged this unavailable fabric — pick a replacement later. */
  needs_replacement?: boolean;
  /** Set when a replacement fabric is chosen (keeps original intent in notes/display). */
  replacement_fabric_number?: string | null;
};

/** @deprecated v2 single-client shape — migrated on restore */
export type SalesOrderFormDraftV2 = {
  version: 2;
  savedAt: string;
  productionBrandId: string | null;
  clientId: string;
  deliveryDestination: DeliveryDestination | "";
  deliveryDate: string;
  notes: string;
  lines: SalesOrderLineDraft[];
  selectedFabricBrandId: string;
  fabricPickerValue: string;
  pendingFabric: FabricSearchItem | null;
  garmentType: string;
  draftLabelCount: string;
  draftMeters: string;
};

export type SalesOrderFormDraft = {
  version: typeof SALES_ORDER_DRAFT_VERSION;
  savedAt: string;
  productionBrandId: string | null;
  activeClientDraftId: string;
  clientDrafts: SalesOrderClientDraft[];
  selectedFabricBrandId: string;
  fabricPickerValue: string;
  pendingFabric: FabricSearchItem | null;
  garmentType: string;
  draftLabelCount: string;
  draftMeters: string;
};

export function migrateSalesOrderDraft(raw: unknown): SalesOrderFormDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const draft = raw as Record<string, unknown>;

  if (draft.version === SALES_ORDER_DRAFT_VERSION) {
    const v3 = draft as SalesOrderFormDraft;
    if (Array.isArray(v3.clientDrafts) && v3.clientDrafts.length > 0) {
      return v3;
    }
  }

  if (
    draft.version === 2 ||
    (typeof draft.clientId === "string" && !Array.isArray(draft.clientDrafts))
  ) {
    const v2 = draft as SalesOrderFormDraftV2;
    const clientDraft: SalesOrderClientDraft = {
      id: `client-${Date.now()}-migrated`,
      clientId: v2.clientId ?? "",
      deliveryDestination: v2.deliveryDestination ?? "",
      deliveryDate: v2.deliveryDate ?? "",
      notes: v2.notes ?? "",
      lines: Array.isArray(v2.lines) ? v2.lines : [],
    };
    return {
      version: SALES_ORDER_DRAFT_VERSION,
      savedAt: typeof v2.savedAt === "string" ? v2.savedAt : new Date().toISOString(),
      productionBrandId: v2.productionBrandId ?? null,
      activeClientDraftId: clientDraft.id,
      clientDrafts: [clientDraft],
      selectedFabricBrandId: v2.selectedFabricBrandId ?? "",
      fabricPickerValue: v2.fabricPickerValue ?? "",
      pendingFabric: v2.pendingFabric ?? null,
      garmentType: v2.garmentType ?? "",
      draftLabelCount: v2.draftLabelCount ?? "1",
      draftMeters: v2.draftMeters ?? "",
    };
  }

  return null;
}

export function countDraftFabricLines(draft: SalesOrderFormDraft): number {
  return draft.clientDrafts.reduce((sum, entry) => sum + entry.lines.length, 0);
}

/** Read the richest fabric-order draft from local storage (includes legacy sales-order:new key). */
export function readFabricOrderLocalDraft(): SalesOrderFormDraft | null {
  const candidates = [
    readLocalDraft<unknown>(DRAFT_KEYS.fabricOrderNew),
    readLocalDraft<unknown>(DRAFT_KEYS.salesOrderNew),
  ];

  let best: SalesOrderFormDraft | null = null;
  let bestLines = 0;

  for (const raw of candidates) {
    const draft = migrateSalesOrderDraft(raw);
    if (!draft || isSalesOrderDraftEmpty(draft)) continue;
    const lines = countDraftFabricLines(draft);
    if (lines > bestLines) {
      best = draft;
      bestLines = lines;
    }
  }

  return best;
}

/** Pick the draft with the most fabric lines for server backup (snapshot vs local storage). */
export function resolveBestDraftForServerSave(
  snapshot: SalesOrderFormDraft,
  readLocal: () => SalesOrderFormDraft | null = () => null
): SalesOrderFormDraft {
  const stored = readLocal();
  if (stored && !isSalesOrderDraftEmpty(stored)) {
    const storedLines = countDraftFabricLines(stored);
    const snapshotLines = countDraftFabricLines(snapshot);
    if (storedLines >= snapshotLines) {
      return stored;
    }
  }
  return snapshot;
}

export function resolveFabricOrderDraftForServerSave(snapshot: SalesOrderFormDraft): SalesOrderFormDraft {
  return resolveBestDraftForServerSave(snapshot, readFabricOrderLocalDraft);
}

/**
 * Prefer the draft with more fabric lines. When incoming has fewer lines than existing
 * (stale client save), keep existing line data while applying incoming metadata.
 */
export function mergeSalesOrderDraftPreservingLines(
  existing: SalesOrderFormDraft,
  incoming: SalesOrderFormDraft
): SalesOrderFormDraft {
  const existingCount = countDraftFabricLines(existing);
  const incomingCount = countDraftFabricLines(incoming);
  if (incomingCount >= existingCount) {
    return incoming;
  }

  const mergedClientDrafts = incoming.clientDrafts.map((incomingEntry) => {
    const existingEntry = existing.clientDrafts.find(
      (row) =>
        row.id === incomingEntry.id ||
        (row.clientId && incomingEntry.clientId && row.clientId === incomingEntry.clientId)
    );
    if (!existingEntry || existingEntry.lines.length <= incomingEntry.lines.length) {
      return incomingEntry;
    }
    return { ...incomingEntry, lines: existingEntry.lines };
  });

  for (const existingEntry of existing.clientDrafts) {
    if (existingEntry.lines.length === 0) continue;
    const alreadyMerged = mergedClientDrafts.some(
      (row) =>
        row.id === existingEntry.id ||
        (row.clientId && existingEntry.clientId && row.clientId === existingEntry.clientId)
    );
    if (!alreadyMerged) {
      mergedClientDrafts.push(existingEntry);
    }
  }

  return { ...incoming, clientDrafts: mergedClientDrafts };
}

export function isSalesOrderDraftEmpty(raw: unknown): boolean {
  const draft = migrateSalesOrderDraft(raw);
  if (!draft) return true;

  const hasClientData = draft.clientDrafts.some(
    (entry) =>
      entry.clientId ||
      entry.deliveryDestination ||
      entry.deliveryDate ||
      entry.notes ||
      entry.lines.length > 0
  );

  return (
    !hasClientData &&
    !draft.pendingFabric &&
    !draft.fabricPickerValue.trim() &&
    !draft.garmentType &&
    !draft.selectedFabricBrandId
  );
}

export type SalesOrderDraftSummary = {
  savedAt: string;
  clientEntries: Array<{ label: string; fabricCount: number }>;
  totalFabrics: number;
};

export function describeSalesOrderDraftSummary(
  raw: unknown,
  clients: Array<{ id: string; first_name: string; last_name: string; middle_name?: string | null }>
): SalesOrderDraftSummary | null {
  const draft = migrateSalesOrderDraft(raw);
  if (!draft || isSalesOrderDraftEmpty(draft)) return null;

  const clientEntries = draft.clientDrafts.map((entry, index) => {
    const client = clients.find((row) => row.id === entry.clientId);
    const label = client
      ? [client.first_name, client.middle_name, client.last_name].filter(Boolean).join(" ").trim()
      : entry.clientId
        ? "Unnamed client"
        : `Client ${index + 1}`;
    return { label, fabricCount: entry.lines.length };
  });

  return {
    savedAt: draft.savedAt,
    clientEntries,
    totalFabrics: clientEntries.reduce((total, entry) => total + entry.fabricCount, 0),
  };
}
