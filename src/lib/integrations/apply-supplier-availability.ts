import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesOrdersFresh, writeSalesOrders } from "@/lib/data/sales-orders";
import { normalizeFabricToken } from "@/lib/email/inbound/parse-availability-from-email";
import {
  ensureFabricOrdersLoaded,
  getStoredFabricOrder,
  listStoredFabricOrders,
  updateStoredFabricOrders,
} from "@/lib/integrations/fabric-order-store";
import type { SupplierLineUpdate } from "@/lib/integrations/supplier-reply-store";
import { listSupplierReplies } from "@/lib/integrations/supplier-reply-store";
import type { PurchaseOrderLine } from "@/lib/types/fabric-sourcing";
import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";

export type ApplySupplierAvailabilityResult = {
  sales_orders_updated: number;
  sales_order_lines_updated: number;
  fabric_pos_updated: number;
  fabric_po_lines_updated: number;
};

function fabricNumbersMatch(a: string, b: string): boolean {
  return normalizeFabricToken(a) === normalizeFabricToken(b);
}

function findLineUpdate(
  lineUpdates: SupplierLineUpdate[],
  fabricNumber: string
): SupplierLineUpdate | undefined {
  return lineUpdates.find((update) => fabricNumbersMatch(update.fabric_number, fabricNumber));
}

function mapLineUpdateToSalesOrderFields(
  update: SupplierLineUpdate
): Pick<SalesOrderFabricLine, "stock_status" | "restock_date" | "needs_replacement" | "replacement_fabric_number"> {
  switch (update.status) {
    case "temp_unavailable":
      return {
        stock_status: "temp_unavailable",
        restock_date: update.restock_date ?? null,
        needs_replacement: false,
        replacement_fabric_number: null,
      };
    case "permanently_unavailable":
      return {
        stock_status: "permanently_unavailable",
        restock_date: null,
        needs_replacement: true,
        replacement_fabric_number: null,
      };
    case "substituted":
      return {
        stock_status: "permanently_unavailable",
        restock_date: null,
        needs_replacement: true,
        replacement_fabric_number: update.substitute_fabric_number ?? null,
      };
    case "confirmed":
      return {
        stock_status: "in_stock",
        restock_date: null,
        needs_replacement: false,
        replacement_fabric_number: null,
      };
  }
}

function mapLineUpdateToPoLineFields(
  update: SupplierLineUpdate
): Pick<PurchaseOrderLine, "stock_status" | "restock_date" | "availability_note" | "substitute_fabric_number"> {
  const stock_status =
    update.status === "confirmed"
      ? "in_stock"
      : update.status === "temp_unavailable"
        ? "temp_unavailable"
        : "permanently_unavailable";

  return {
    stock_status,
    restock_date: update.restock_date ?? null,
    availability_note: update.note ?? null,
    substitute_fabric_number: update.substitute_fabric_number ?? null,
  };
}

function resolvePurchaseOrder(input: {
  purchase_order_id?: string | null;
  po_number?: string | null;
}) {
  if (input.purchase_order_id) {
    const byId = getStoredFabricOrder(input.purchase_order_id);
    if (byId) return byId;
  }

  const poNumber = input.po_number?.trim();
  if (!poNumber) return undefined;

  return listStoredFabricOrders().find(
    (order) => order.po_number.toUpperCase() === poNumber.toUpperCase()
  );
}

function lineMatchesSupplier(
  lineSupplierId: string,
  supplierId: string | null | undefined
): boolean {
  if (!supplierId) return true;
  return lineSupplierId === supplierId;
}

export async function applySupplierAvailabilityUpdates(input: {
  line_updates: SupplierLineUpdate[];
  purchase_order_id?: string | null;
  po_number?: string | null;
  supplier_id?: string | null;
}): Promise<ApplySupplierAvailabilityResult> {
  const lineUpdates = input.line_updates.filter(
    (update) =>
      update.status === "temp_unavailable" ||
      update.status === "permanently_unavailable" ||
      update.status === "substituted"
  );

  const empty: ApplySupplierAvailabilityResult = {
    sales_orders_updated: 0,
    sales_order_lines_updated: 0,
    fabric_pos_updated: 0,
    fabric_po_lines_updated: 0,
  };

  if (lineUpdates.length === 0) return empty;

  await Promise.all([
    ensureDocumentsLoaded(["sales_orders"]),
    ensureFabricOrdersLoaded(),
  ]);

  const purchaseOrder = resolvePurchaseOrder(input);
  const supplierId = input.supplier_id ?? purchaseOrder?.supplier_id ?? null;

  let fabric_pos_updated = 0;
  let fabric_po_lines_updated = 0;

  if (purchaseOrder) {
    updateStoredFabricOrders((orders) =>
      orders.map((po) => {
        if (po.id !== purchaseOrder.id) return po;

        let poChanged = false;
        const lines = (po.lines ?? []).map((line) => {
          if (!line.fabric_number) return line;
          const update = findLineUpdate(lineUpdates, line.fabric_number);
          if (!update) return line;

          poChanged = true;
          fabric_po_lines_updated += 1;
          return { ...line, ...mapLineUpdateToPoLineFields(update) };
        });

        if (!poChanged) return po;
        fabric_pos_updated += 1;
        return { ...po, lines };
      })
    );
  }

  const salesOrderId = purchaseOrder?.sales_order_id ?? null;
  if (!salesOrderId) return { ...empty, fabric_pos_updated, fabric_po_lines_updated };

  const store = await readSalesOrdersFresh();
  const orderIndex = store.orders.findIndex((order) => order.id === salesOrderId);
  if (orderIndex < 0) return { ...empty, fabric_pos_updated, fabric_po_lines_updated };

  const order = store.orders[orderIndex];
  let orderChanged = false;
  let sales_order_lines_updated = 0;

  const fabric_lines = order.fabric_lines.map((line) => {
    if (!lineMatchesSupplier(line.supplier_id, supplierId)) return line;
    const update = findLineUpdate(lineUpdates, line.fabric_number);
    if (!update) return line;

    orderChanged = true;
    sales_order_lines_updated += 1;
    return { ...line, ...mapLineUpdateToSalesOrderFields(update) };
  });

  if (!orderChanged) {
    return { ...empty, fabric_pos_updated, fabric_po_lines_updated };
  }

  store.orders[orderIndex] = { ...order, fabric_lines };
  await writeSalesOrders(store);

  return {
    sales_orders_updated: 1,
    sales_order_lines_updated,
    fabric_pos_updated,
    fabric_po_lines_updated,
  };
}

export async function backfillSupplierAvailabilityFromReplies(): Promise<
  ApplySupplierAvailabilityResult & { replies_processed: number }
> {
  await Promise.all([
    ensureDocumentsLoaded(["sales_orders", "supplier_replies"]),
    ensureFabricOrdersLoaded(),
  ]);

  const replies = listSupplierReplies(500).filter((reply) => (reply.line_updates?.length ?? 0) > 0);

  const totals: ApplySupplierAvailabilityResult & { replies_processed: number } = {
    replies_processed: 0,
    sales_orders_updated: 0,
    sales_order_lines_updated: 0,
    fabric_pos_updated: 0,
    fabric_po_lines_updated: 0,
  };

  for (const reply of replies) {
    const result = await applySupplierAvailabilityUpdates({
      line_updates: reply.line_updates ?? [],
      purchase_order_id: reply.purchase_order_id,
      po_number: reply.po_number,
      supplier_id: reply.supplier_id,
    });

    totals.replies_processed += 1;
    totals.sales_orders_updated += result.sales_orders_updated;
    totals.sales_order_lines_updated += result.sales_order_lines_updated;
    totals.fabric_pos_updated += result.fabric_pos_updated;
    totals.fabric_po_lines_updated += result.fabric_po_lines_updated;
  }

  return totals;
}
