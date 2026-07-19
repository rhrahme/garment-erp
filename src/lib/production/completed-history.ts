import { getFactoryBrands } from "@/lib/data/factory-brands";
import { READY_MADE_BRANDS } from "@/lib/integrations/clickup/ready-made-brands";
import { productionBrandNameForOrder } from "@/lib/sales-orders/production-brand";
import type { ProductionWorkOrder } from "@/lib/types/production";
import { formatDate } from "@/lib/utils";

export type CompletedProductionView =
  | "by_client"
  | "by_day"
  | "by_order"
  | "by_ready_made"
  | "by_brand";

export type CompletedOrderCluster = {
  sales_order_id: string;
  so_number: string;
  orders: ProductionWorkOrder[];
};

export type CompletedHistorySection = {
  key: string;
  label: string;
  meta: string;
  clusters: CompletedOrderCluster[];
};

export function isReadyMadeWorkOrder(
  order: Pick<ProductionWorkOrder, "client_id" | "client_code">
): boolean {
  if (order.client_id.startsWith("cu-retail-")) return true;
  return READY_MADE_BRANDS.some((brand) => brand.client_code === order.client_code);
}

export function readyMadeBrandLabel(
  order: Pick<ProductionWorkOrder, "client_id" | "client_code" | "client_name">
): string | null {
  if (!isReadyMadeWorkOrder(order)) return null;
  const brand = READY_MADE_BRANDS.find((item) => item.client_code === order.client_code);
  return brand?.label ?? order.client_name;
}

/** Bespoke client name or ready-made retail brand — never treat RM as a person client. */
export function completedAccountLabel(order: ProductionWorkOrder): string {
  const label = readyMadeBrandLabel(order) ?? order.client_name;
  return label?.trim() || "—";
}

export function factoryBrandLabelForWorkOrder(
  order: Pick<ProductionWorkOrder, "client_code" | "client_name" | "client_id">
): string {
  return productionBrandNameForOrder({
    client_code: order.client_code,
    retail_brand: null,
  });
}

export function productionBrandLabelForWorkOrder(
  order: Pick<ProductionWorkOrder, "client_code" | "client_name" | "client_id">
): string {
  const readyMade = readyMadeBrandLabel(order);
  if (readyMade) return readyMade;
  return factoryBrandLabelForWorkOrder(order);
}

export function matchesCompletedSearch(order: ProductionWorkOrder, query: string): boolean {
  const haystack = [
    order.sticker_code,
    order.client_name,
    order.client_code,
    order.so_number,
    order.garment_type,
    order.piece_name,
    order.fabric_number,
    order.supplier_name,
    productionBrandLabelForWorkOrder(order),
    isReadyMadeWorkOrder(order) ? "ready-made" : "client",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function completedDayKey(order: ProductionWorkOrder): string {
  return order.completed_at?.slice(0, 10) ?? "unknown";
}

export function filterCompletedOrdersByDay(
  orders: ProductionWorkOrder[],
  day: string
): ProductionWorkOrder[] {
  if (!day.trim()) return orders;
  return orders.filter((order) => completedDayKey(order) === day);
}

function uniqueSortedLabels(labels: string[]): string[] {
  return [...new Set(labels)].sort((a, b) => a.localeCompare(b));
}

export function listFactoryBrandOptions(orders: ProductionWorkOrder[]): string[] {
  const fromCatalog = getFactoryBrands().map((brand) => brand.name);
  const fromOrders = orders
    .filter((order) => !isReadyMadeWorkOrder(order))
    .map((order) => factoryBrandLabelForWorkOrder(order));
  return uniqueSortedLabels([...fromCatalog, ...fromOrders]);
}

export function listReadyMadeBrandOptions(orders: ProductionWorkOrder[]): string[] {
  const fromCatalog = READY_MADE_BRANDS.map((brand) => brand.label);
  const fromOrders = orders
    .filter(isReadyMadeWorkOrder)
    .map((order) => readyMadeBrandLabel(order) ?? order.client_name);
  return uniqueSortedLabels([...fromCatalog, ...fromOrders]);
}

export function listBespokeClientOptions(orders: ProductionWorkOrder[]): string[] {
  return uniqueSortedLabels(
    orders.filter((order) => !isReadyMadeWorkOrder(order)).map((order) => order.client_name)
  );
}

export function filterCompletedOrdersByFactoryBrand(
  orders: ProductionWorkOrder[],
  brand: string
): ProductionWorkOrder[] {
  if (!brand.trim()) return orders;
  return orders.filter(
    (order) => !isReadyMadeWorkOrder(order) && factoryBrandLabelForWorkOrder(order) === brand
  );
}

export function filterCompletedOrdersByReadyMadeBrand(
  orders: ProductionWorkOrder[],
  brand: string
): ProductionWorkOrder[] {
  if (!brand.trim()) return orders;
  return orders.filter(
    (order) => isReadyMadeWorkOrder(order) && (readyMadeBrandLabel(order) ?? order.client_name) === brand
  );
}

export function filterCompletedOrdersByBespokeClient(
  orders: ProductionWorkOrder[],
  clientName: string
): ProductionWorkOrder[] {
  if (!clientName.trim()) return orders;
  return orders.filter(
    (order) => !isReadyMadeWorkOrder(order) && order.client_name === clientName
  );
}

export function formatCompletedDayLabel(dayKey: string): string {
  if (dayKey === "unknown") return "Date unknown";

  const date = new Date(`${dayKey}T12:00:00`);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function sortOrdersNewestFirst(orders: ProductionWorkOrder[]): ProductionWorkOrder[] {
  return [...orders].sort((a, b) => {
    const aTime = a.completed_at ? Date.parse(a.completed_at) : 0;
    const bTime = b.completed_at ? Date.parse(b.completed_at) : 0;
    return bTime - aTime;
  });
}

function sortClusters(
  clusters: CompletedOrderCluster[],
  view: CompletedProductionView
): CompletedOrderCluster[] {
  return [...clusters].sort((a, b) => {
    if (view === "by_day" || view === "by_brand" || view === "by_ready_made") {
      const firstA = a.orders[0];
      const firstB = b.orders[0];
      if (firstA && firstB) {
        const accountCompare = completedAccountLabel(firstA).localeCompare(completedAccountLabel(firstB));
        if (accountCompare !== 0) return accountCompare;
      }
    }
    return b.so_number.localeCompare(a.so_number);
  });
}

function buildClusters(orders: ProductionWorkOrder[], view: CompletedProductionView): CompletedOrderCluster[] {
  const byOrder = new Map<string, ProductionWorkOrder[]>();

  for (const order of sortOrdersNewestFirst(orders)) {
    const list = byOrder.get(order.sales_order_id) ?? [];
    list.push(order);
    byOrder.set(order.sales_order_id, list);
  }

  const clusters = [...byOrder.entries()].map(([sales_order_id, clusterOrders]) => ({
    sales_order_id,
    so_number: clusterOrders[0]?.so_number ?? sales_order_id,
    orders: clusterOrders,
  }));

  return sortClusters(clusters, view);
}

function sectionMeta(orders: ProductionWorkOrder[]): string {
  const pieceCount = orders.length;
  const orderCount = new Set(orders.map((order) => order.sales_order_id)).size;
  const pieceLabel = `${pieceCount} piece${pieceCount === 1 ? "" : "s"}`;
  const orderLabel = `${orderCount} order${orderCount === 1 ? "" : "s"}`;
  return `${pieceLabel} · ${orderLabel}`;
}

function clientSections(orders: ProductionWorkOrder[]): CompletedHistorySection[] {
  const byClient = new Map<string, ProductionWorkOrder[]>();

  for (const order of orders) {
    if (isReadyMadeWorkOrder(order)) continue;
    const list = byClient.get(order.client_name) ?? [];
    list.push(order);
    byClient.set(order.client_name, list);
  }

  return [...byClient.entries()]
    .map(([client_name, clientOrders]) => {
      const sorted = sortOrdersNewestFirst(clientOrders);
      const latest = sorted[0]?.completed_at?.slice(0, 10);
      const displayName = client_name.trim() || "—";
      return {
        key: `client-${client_name || "unassigned"}`,
        label: displayName,
        meta: latest
          ? `${sectionMeta(clientOrders)} · latest ${formatDate(latest)}`
          : sectionMeta(clientOrders),
        clusters: buildClusters(clientOrders, "by_client"),
      };
    })
    .sort((a, b) => {
      const aLatest = a.clusters[0]?.orders[0]?.completed_at ?? "";
      const bLatest = b.clusters[0]?.orders[0]?.completed_at ?? "";
      return bLatest.localeCompare(aLatest) || a.label.localeCompare(b.label);
    });
}

function daySections(orders: ProductionWorkOrder[]): CompletedHistorySection[] {
  const byDay = new Map<string, ProductionWorkOrder[]>();

  for (const order of orders) {
    const day = completedDayKey(order);
    const list = byDay.get(day) ?? [];
    list.push(order);
    byDay.set(day, list);
  }

  return [...byDay.entries()]
    .map(([day, dayOrders]) => {
      const clientCount = new Set(
        dayOrders.filter((order) => !isReadyMadeWorkOrder(order)).map((order) => order.client_name)
      ).size;
      const readyMadeCount = new Set(
        dayOrders.filter(isReadyMadeWorkOrder).map((order) => completedAccountLabel(order))
      ).size;
      const accountParts: string[] = [];
      if (clientCount > 0) accountParts.push(`${clientCount} client${clientCount === 1 ? "" : "s"}`);
      if (readyMadeCount > 0) {
        accountParts.push(`${readyMadeCount} ready-made brand${readyMadeCount === 1 ? "" : "s"}`);
      }
      return {
        key: `day-${day}`,
        label: formatCompletedDayLabel(day),
        meta: `${sectionMeta(dayOrders)} · ${accountParts.join(" · ") || "no accounts"}`,
        clusters: buildClusters(dayOrders, "by_day"),
      };
    })
    .sort((a, b) => b.key.localeCompare(a.key));
}

function orderSections(orders: ProductionWorkOrder[]): CompletedHistorySection[] {
  const byOrder = new Map<string, ProductionWorkOrder[]>();

  for (const order of orders) {
    const list = byOrder.get(order.sales_order_id) ?? [];
    list.push(order);
    byOrder.set(order.sales_order_id, list);
  }

  return [...byOrder.entries()]
    .map(([sales_order_id, orderPieces]) => {
      const sorted = sortOrdersNewestFirst(orderPieces);
      const so_number = sorted[0]?.so_number ?? sales_order_id;
      const account = sorted[0] ? completedAccountLabel(sorted[0]) : "";
      const accountKind = sorted[0] && isReadyMadeWorkOrder(sorted[0]) ? "Ready-made" : "Client";
      const latest = sorted[0]?.completed_at?.slice(0, 10);
      const pieceLabel = `${orderPieces.length} piece${orderPieces.length === 1 ? "" : "s"}`;

      return {
        key: `order-${sales_order_id}`,
        label: `${so_number} · ${account}`,
        meta: latest
          ? `${accountKind} · ${pieceLabel} · completed ${formatDate(latest)}`
          : `${accountKind} · ${pieceLabel}`,
        clusters: [
          {
            sales_order_id,
            so_number,
            orders: sorted,
          },
        ],
      };
    })
    .sort((a, b) => b.label.localeCompare(a.label));
}

function readyMadeSections(orders: ProductionWorkOrder[]): CompletedHistorySection[] {
  const byBrand = new Map<string, ProductionWorkOrder[]>();

  for (const brand of READY_MADE_BRANDS) {
    byBrand.set(brand.label, []);
  }

  for (const order of orders) {
    if (!isReadyMadeWorkOrder(order)) continue;
    const brand = readyMadeBrandLabel(order) ?? order.client_name;
    const list = byBrand.get(brand) ?? [];
    list.push(order);
    byBrand.set(brand, list);
  }

  return [...byBrand.entries()]
    .map(([brand, brandOrders]) => {
      const latest = sortOrdersNewestFirst(brandOrders)[0]?.completed_at?.slice(0, 10);
      return {
        key: `ready-made-${brand}`,
        label: brand,
        meta:
          brandOrders.length === 0
            ? emptyBrandMeta()
            : latest
              ? `${sectionMeta(brandOrders)} · latest ${formatDate(latest)}`
              : sectionMeta(brandOrders),
        clusters: buildClusters(brandOrders, "by_ready_made"),
      };
    })
    .sort((a, b) => {
      const aLatest = a.clusters[0]?.orders[0]?.completed_at ?? "";
      const bLatest = b.clusters[0]?.orders[0]?.completed_at ?? "";
      return bLatest.localeCompare(aLatest) || a.label.localeCompare(b.label);
    });
}

function emptyBrandMeta(): string {
  return "0 pieces · 0 orders · no completions yet";
}

function brandSections(orders: ProductionWorkOrder[]): CompletedHistorySection[] {
  const byBrand = new Map<string, ProductionWorkOrder[]>();

  for (const brand of getFactoryBrands()) {
    byBrand.set(brand.name, []);
  }

  for (const order of orders) {
    if (isReadyMadeWorkOrder(order)) continue;
    const brand = factoryBrandLabelForWorkOrder(order);
    const list = byBrand.get(brand) ?? [];
    list.push(order);
    byBrand.set(brand, list);
  }

  return [...byBrand.entries()]
    .map(([brand, brandOrders]) => {
      const clientCount = new Set(brandOrders.map((order) => order.client_name)).size;
      const clientLabel =
        clientCount > 0 ? `${clientCount} client${clientCount === 1 ? "" : "s"}` : "no clients yet";
      return {
        key: `brand-${brand}`,
        label: brand,
        meta: brandOrders.length > 0 ? `${sectionMeta(brandOrders)} · ${clientLabel}` : emptyBrandMeta(),
        clusters: buildClusters(brandOrders, "by_brand"),
      };
    })
    .sort((a, b) => {
      const aCount = a.clusters.reduce((sum, cluster) => sum + cluster.orders.length, 0);
      const bCount = b.clusters.reduce((sum, cluster) => sum + cluster.orders.length, 0);
      return bCount - aCount || a.label.localeCompare(b.label);
    });
}

export function buildCompletedHistorySections(
  orders: ProductionWorkOrder[],
  view: CompletedProductionView
): CompletedHistorySection[] {
  const sorted = sortOrdersNewestFirst(orders);

  switch (view) {
    case "by_client":
      return clientSections(sorted);
    case "by_day":
      return daySections(sorted);
    case "by_ready_made":
      return readyMadeSections(sorted);
    case "by_brand":
      return brandSections(sorted);
    case "by_order":
      return orderSections(sorted);
  }
}

export function defaultExpandedSectionKeys(sections: CompletedHistorySection[]): Set<string> {
  if (sections.length <= 6) return new Set(sections.map((section) => section.key));
  return new Set(sections.slice(0, 5).map((section) => section.key));
}
