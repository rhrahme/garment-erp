import type { SalesOrderLineDraft } from "@/lib/autosave/sales-order-draft";
import { formatClientShortName } from "@/lib/clients/names";
import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";

type ClientTabName = {
  id: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  code: string;
};

export type SalesOrderClientDraft = {
  id: string;
  clientId: string;
  deliveryDestination: DeliveryDestination | "";
  deliveryDate: string;
  notes: string;
  lines: SalesOrderLineDraft[];
};

export function createClientDraft(partial?: Partial<SalesOrderClientDraft>): SalesOrderClientDraft {
  return {
    id: partial?.id ?? `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    clientId: partial?.clientId ?? "",
    deliveryDestination: partial?.deliveryDestination ?? "",
    deliveryDate: partial?.deliveryDate ?? "",
    notes: partial?.notes ?? "",
    lines: partial?.lines ?? [],
  };
}

export function cloneClientDraftLines(lines: SalesOrderLineDraft[]): SalesOrderLineDraft[] {
  const stamp = Date.now();
  return lines.map((line, index) => ({
    ...line,
    lineId: `line-clone-${stamp}-${index}-${line.fabric_number}`,
  }));
}

export function clientDraftTabLabel(
  draft: SalesOrderClientDraft,
  index: number,
  clients: ClientTabName[]
): string {
  const client = clients.find((entry) => entry.id === draft.clientId);
  if (client) {
    return formatClientShortName(client) || client.code;
  }
  return `Client ${index + 1}`;
}

/** One client row while adding a fabric — garment, labels, and meters can differ per client. */
export type FabricAddClientEntry = {
  id: string;
  clientId: string;
  garmentType: string;
  labelCount: string;
  meters: string;
};

export function createFabricAddEntry(
  partial?: Partial<FabricAddClientEntry>,
  copyFrom?: FabricAddClientEntry
): FabricAddClientEntry {
  return {
    id: partial?.id ?? `add-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    clientId: partial?.clientId ?? copyFrom?.clientId ?? "",
    garmentType: partial?.garmentType ?? copyFrom?.garmentType ?? "",
    labelCount: partial?.labelCount ?? copyFrom?.labelCount ?? "1",
    meters: partial?.meters ?? copyFrom?.meters ?? "",
  };
}

export function clientIdTabLabel(
  clientId: string,
  index: number,
  clients: ClientTabName[]
): string {
  if (!clientId) return `Client ${index + 1}`;
  const client = clients.find((entry) => entry.id === clientId);
  if (client) {
    return formatClientShortName(client) || client.code;
  }
  return `Client ${index + 1}`;
}
