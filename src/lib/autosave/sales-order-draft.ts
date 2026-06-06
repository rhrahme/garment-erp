import type { FabricSearchItem } from "@/lib/autosave/fabric-search-item";
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
