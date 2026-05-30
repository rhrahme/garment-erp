import type { FabricSearchItem } from "@/lib/autosave/fabric-search-item";

export const SALES_ORDER_DRAFT_VERSION = 2;

import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";

export type SalesOrderLineDraft = FabricSearchItem & {
  lineId: string;
  garment_type: string;
  label_count: number;
  meters: string;
};

export type SalesOrderFormDraft = {
  version: typeof SALES_ORDER_DRAFT_VERSION;
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

export function isSalesOrderDraftEmpty(draft: SalesOrderFormDraft): boolean {
  return (
    !draft.clientId &&
    !draft.deliveryDestination &&
    !draft.deliveryDate &&
    !draft.notes &&
    draft.lines.length === 0 &&
    !draft.pendingFabric &&
    !draft.fabricPickerValue.trim() &&
    !draft.garmentType &&
    !draft.selectedFabricBrandId
  );
}
