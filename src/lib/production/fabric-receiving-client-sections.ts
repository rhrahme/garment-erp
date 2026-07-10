import type {
  FabricReceivingLineRow,
  FabricReceivingOrderRow,
} from "@/lib/types/fabric-receipts";

export type FabricReceivingCutEntry = {
  order: FabricReceivingOrderRow;
  line: FabricReceivingLineRow;
};

export type FabricReceivingOrderGroup = {
  key: string;
  order: FabricReceivingOrderRow;
  entries: FabricReceivingCutEntry[];
};

export type FabricReceivingClientSection = {
  key: string;
  client_name: string;
  client_code: string;
  orderGroups: FabricReceivingOrderGroup[];
  lineCount: number;
  pendingCount: number;
  latestActivity: string;
};

function latestEntryActivity(entry: FabricReceivingCutEntry): string {
  return entry.line.updated_at ?? entry.line.received_at ?? "";
}

function sectionLatestActivity(entries: FabricReceivingCutEntry[]): string {
  return entries.reduce((latest, entry) => {
    const activity = latestEntryActivity(entry);
    return activity > latest ? activity : latest;
  }, "");
}

export function groupFabricReceivingCutsByClient(
  entries: FabricReceivingCutEntry[]
): FabricReceivingClientSection[] {
  const byClient = new Map<
    string,
    { client_name: string; client_code: string; entries: FabricReceivingCutEntry[] }
  >();

  for (const entry of entries) {
    const key = entry.order.client_code;
    const group = byClient.get(key) ?? {
      client_name: entry.order.client_name,
      client_code: key,
      entries: [],
    };
    group.entries.push(entry);
    byClient.set(key, group);
  }

  return [...byClient.values()]
    .map(({ client_name, client_code, entries }) => {
      const byOrder = new Map<string, FabricReceivingCutEntry[]>();
      for (const entry of entries) {
        const list = byOrder.get(entry.order.sales_order_id) ?? [];
        list.push(entry);
        byOrder.set(entry.order.sales_order_id, list);
      }

      const orderGroups: FabricReceivingOrderGroup[] = [...byOrder.entries()]
        .map(([orderId, orderEntries]) => ({
          key: orderId,
          order: orderEntries[0]!.order,
          entries: orderEntries,
        }))
        .sort((a, b) => b.order.so_number.localeCompare(a.order.so_number));

      return {
        key: client_code,
        client_name,
        client_code,
        orderGroups,
        lineCount: entries.length,
        pendingCount: entries.filter((entry) => entry.line.status === "pending").length,
        latestActivity: sectionLatestActivity(entries),
      };
    })
    .sort((a, b) => {
      if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
      const byActivity = b.latestActivity.localeCompare(a.latestActivity);
      if (byActivity !== 0) return byActivity;
      return a.client_name.localeCompare(b.client_name);
    });
}

export function defaultFabricReceivingExpandedKeys(sections: FabricReceivingClientSection[]): Set<string> {
  if (sections.length <= 6) return new Set(sections.map((section) => section.key));
  return new Set(sections.slice(0, 5).map((section) => section.key));
}

export function fabricReceivingClientSectionMeta(section: FabricReceivingClientSection): string {
  const orderCount = section.orderGroups.length;
  const orderLabel = `${orderCount} order${orderCount === 1 ? "" : "s"}`;
  const cutLabel = `${section.lineCount} fabric cut${section.lineCount === 1 ? "" : "s"}`;
  return `${cutLabel} · ${orderLabel}`;
}
