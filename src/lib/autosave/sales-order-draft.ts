import { DRAFT_KEYS } from "@/lib/autosave/draft-keys";
import type { FabricSearchItem } from "@/lib/autosave/fabric-search-item";
import {
  clearLocalDraft,
  readLocalDraft,
  writeLocalDraft,
} from "@/lib/autosave/local-draft-storage";
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
    const label = clientDraftLabel(entry, index, clients);
    return { label, fabricCount: entry.lines.length };
  });

  return {
    savedAt: draft.savedAt,
    clientEntries,
    totalFabrics: clientEntries.reduce((total, entry) => total + entry.fabricCount, 0),
  };
}

export function clientDraftHasContinueContent(entry: SalesOrderClientDraft): boolean {
  return (
    entry.lines.length > 0 ||
    Boolean(entry.clientId) ||
    Boolean(entry.deliveryDestination) ||
    Boolean(entry.deliveryDate) ||
    Boolean(entry.notes.trim())
  );
}

export function clientDraftLabel(
  entry: SalesOrderClientDraft,
  index: number,
  clients: Array<{ id: string; first_name: string; last_name: string; middle_name?: string | null }>
): string {
  const client = clients.find((row) => row.id === entry.clientId);
  if (client) {
    return [client.first_name, client.middle_name, client.last_name].filter(Boolean).join(" ").trim();
  }
  return entry.clientId ? "Unnamed client" : `Client ${index + 1}`;
}

export function filterDraftToClientDraft(
  draft: SalesOrderFormDraft,
  clientDraftId: string
): SalesOrderFormDraft | null {
  const entry = draft.clientDrafts.find((row) => row.id === clientDraftId);
  if (!entry) return null;
  return {
    ...draft,
    savedAt: new Date().toISOString(),
    clientDrafts: [entry],
    activeClientDraftId: entry.id,
  };
}

export function removeClientDraftFromFormDraft(
  draft: SalesOrderFormDraft,
  clientDraftId: string
): SalesOrderFormDraft | null {
  const remaining = draft.clientDrafts.filter((row) => row.id !== clientDraftId);
  if (remaining.length === 0) return null;
  const activeId =
    draft.activeClientDraftId !== clientDraftId &&
    remaining.some((row) => row.id === draft.activeClientDraftId)
      ? draft.activeClientDraftId
      : remaining[0]!.id;
  return {
    ...draft,
    savedAt: new Date().toISOString(),
    clientDrafts: remaining,
    activeClientDraftId: activeId,
  };
}

export type FabricOrderDraftQueue = {
  version: 1;
  entries: SalesOrderFormDraft[];
};

export function readFabricOrderDraftQueue(): SalesOrderFormDraft[] {
  const raw = readLocalDraft<FabricOrderDraftQueue>(DRAFT_KEYS.fabricOrderQueue);
  if (!raw || raw.version !== 1 || !Array.isArray(raw.entries)) return [];
  return raw.entries
    .map((entry) => migrateSalesOrderDraft(entry))
    .filter((entry): entry is SalesOrderFormDraft => Boolean(entry && !isSalesOrderDraftEmpty(entry)));
}

export function writeFabricOrderDraftQueue(entries: SalesOrderFormDraft[]): void {
  const nonEmpty = entries.filter((entry) => !isSalesOrderDraftEmpty(entry));
  if (nonEmpty.length === 0) {
    clearLocalDraft(DRAFT_KEYS.fabricOrderQueue);
    return;
  }
  writeLocalDraft(DRAFT_KEYS.fabricOrderQueue, {
    version: 1,
    entries: nonEmpty,
  });
}

export function enqueueFabricOrderDrafts(drafts: SalesOrderFormDraft[]): void {
  const queue = readFabricOrderDraftQueue();
  writeFabricOrderDraftQueue([...queue, ...drafts]);
}

/** Primary local fabric-order draft (not the legacy sales-order key unless it is the only one). */
export function readFabricOrderMainLocalDraft(): SalesOrderFormDraft | null {
  const raw = readLocalDraft<unknown>(DRAFT_KEYS.fabricOrderNew);
  const draft = migrateSalesOrderDraft(raw);
  if (draft && !isSalesOrderDraftEmpty(draft)) return draft;

  const legacyRaw = readLocalDraft<unknown>(DRAFT_KEYS.salesOrderNew);
  const legacy = migrateSalesOrderDraft(legacyRaw);
  if (legacy && !isSalesOrderDraftEmpty(legacy)) return legacy;

  return null;
}

export type FabricOrderContinueOption = {
  optionId: string;
  source: "local-main" | "local-queue" | "server";
  clientDraftId: string;
  label: string;
  fabricCount: number;
  savedAt: string;
  queueIndex?: number;
};

function pushContinueOptionsFromDraft(
  draft: SalesOrderFormDraft,
  source: FabricOrderContinueOption["source"],
  clients: Array<{ id: string; first_name: string; last_name: string; middle_name?: string | null }>,
  options: FabricOrderContinueOption[],
  queueIndex?: number
): void {
  draft.clientDrafts.forEach((entry, index) => {
    if (!clientDraftHasContinueContent(entry)) return;
    options.push({
      optionId: `${source}-${queueIndex ?? "main"}-${entry.id}`,
      source,
      clientDraftId: entry.id,
      label: clientDraftLabel(entry, index, clients),
      fabricCount: entry.lines.length,
      savedAt: draft.savedAt,
      queueIndex,
    });
  });
}

export function buildFabricOrderContinueOptions(
  clients: Array<{ id: string; first_name: string; last_name: string; middle_name?: string | null }>,
  serverDraft: SalesOrderFormDraft | null
): FabricOrderContinueOption[] {
  const mainLocalDraft = readFabricOrderMainLocalDraft();
  const queueDrafts = readFabricOrderDraftQueue();
  const localLines = mainLocalDraft ? countDraftFabricLines(mainLocalDraft) : 0;
  const queueLines = queueDrafts.reduce((sum, draft) => sum + countDraftFabricLines(draft), 0);
  const serverLines = serverDraft ? countDraftFabricLines(serverDraft) : 0;
  const totalLocalLines = localLines + queueLines;
  const preferServer = serverLines > 0 && serverLines > totalLocalLines;

  const options: FabricOrderContinueOption[] = [];

  if (!preferServer) {
    if (mainLocalDraft) {
      pushContinueOptionsFromDraft(mainLocalDraft, "local-main", clients, options);
    }
  } else if (serverDraft) {
    pushContinueOptionsFromDraft(serverDraft, "server", clients, options);
  }

  queueDrafts.forEach((draft, queueIndex) => {
    pushContinueOptionsFromDraft(draft, "local-queue", clients, options, queueIndex);
  });

  return options;
}

export function applyFabricOrderContinuePick(
  option: FabricOrderContinueOption,
  ctx: {
    mainLocalDraft: SalesOrderFormDraft | null;
    queueDrafts: SalesOrderFormDraft[];
    serverDraft: SalesOrderFormDraft | null;
  }
): { picked: SalesOrderFormDraft; serverRemaining?: SalesOrderFormDraft | null } | null {
  if (option.source === "local-queue" && option.queueIndex != null) {
    const entry = ctx.queueDrafts[option.queueIndex];
    if (!entry) return null;
    const picked =
      filterDraftToClientDraft(entry, option.clientDraftId) ??
      (entry.clientDrafts.length === 1 ? entry : null);
    if (!picked) return null;
    const nextQueue = ctx.queueDrafts.filter((_, index) => index !== option.queueIndex);
    writeFabricOrderDraftQueue(nextQueue);
    return { picked };
  }

  if (option.source === "local-main" && ctx.mainLocalDraft) {
    const picked = filterDraftToClientDraft(ctx.mainLocalDraft, option.clientDraftId);
    if (!picked) return null;
    const remaining = removeClientDraftFromFormDraft(ctx.mainLocalDraft, option.clientDraftId);
    if (remaining && !isSalesOrderDraftEmpty(remaining)) {
      const toEnqueue = remaining.clientDrafts
        .filter(clientDraftHasContinueContent)
        .map((client) => filterDraftToClientDraft(remaining, client.id))
        .filter((draft): draft is SalesOrderFormDraft => Boolean(draft));
      enqueueFabricOrderDrafts(toEnqueue);
    }
    clearLocalDraft(DRAFT_KEYS.fabricOrderNew);
    clearLocalDraft(DRAFT_KEYS.salesOrderNew);
    return { picked };
  }

  if (option.source === "server" && ctx.serverDraft) {
    const picked = filterDraftToClientDraft(ctx.serverDraft, option.clientDraftId);
    if (!picked) return null;
    const remaining = removeClientDraftFromFormDraft(ctx.serverDraft, option.clientDraftId);
    const serverRemaining =
      remaining && !isSalesOrderDraftEmpty(remaining) ? remaining : null;
    return { picked, serverRemaining };
  }

  return null;
}
