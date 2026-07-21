import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSupplierByIdFromContactsSync } from "@/lib/data/supplier-contacts";
import { fabricPoSupplierId } from "@/lib/fabric-sourcing/supplier-display";
import { buildClientReference, getSalesOrderById, writeSalesOrders, readSalesOrders } from "@/lib/data/sales-orders";
import {
  createStoredFabricOrder,
  listStoredFabricOrders,
} from "@/lib/integrations/fabric-order-store";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";
import {
  getFabricPosForSalesOrder,
  listSalesOrderFabricLinesMissingPos,
} from "@/lib/sales-orders/line-cross-reference";

function groupLinesByPoSupplier(lines: SalesOrderFabricLine[]): Map<string, SalesOrderFabricLine[]> {
  const groups = new Map<string, SalesOrderFabricLine[]>();
  for (const line of lines) {
    const supplierId = fabricPoSupplierId(line.supplier_id, line.fabric_number);
    const bucket = groups.get(supplierId) ?? [];
    bucket.push(line);
    groups.set(supplierId, bucket);
  }
  return groups;
}

export async function createFabricPosFromSalesOrder(salesOrderId: string): Promise<{
  order: SalesOrder;
  fabricOrders: PurchaseOrder[];
}> {
  // Warm both Supabase documents before reading/writing. Skipping this on a cold
  // instance reads an empty fabric-order store and then overwrites the whole
  // Supabase `fabric_orders` document with only the newly-created POs.
  await ensureDocumentsLoaded(["sales_orders", "fabric_orders", "supplier_contacts"]);

  const store = readSalesOrders();
  const salesOrder = store.orders.find((order) => order.id === salesOrderId);
  if (!salesOrder) {
    throw new Error("Sales order not found.");
  }
  if (salesOrder.fabric_lines.length === 0) {
    throw new Error("Add at least one fabric line to the sales order.");
  }
  if (salesOrder.status !== "open" && salesOrder.status !== "fabric_pos_created") {
    throw new Error("Supplier fabric orders can only be created for open orders.");
  }

  const existingPos = getFabricPosForSalesOrder(salesOrder, listStoredFabricOrders()).filter(
    (po) => po.status !== "cancelled"
  );
  const linesToOrder = listSalesOrderFabricLinesMissingPos(salesOrder.fabric_lines, existingPos);
  if (linesToOrder.length === 0) {
    throw new Error("All fabric lines already have supplier fabric orders.");
  }

  const pendingReplacements = linesToOrder.filter((line) => line.needs_replacement);
  if (pendingReplacements.length > 0) {
    throw new Error(
      `Pick replacements for ${pendingReplacements.map((line) => line.fabric_number).join(", ")} before creating supplier emails.`
    );
  }

  const clientReference = buildClientReference(salesOrder.client_code, salesOrder.so_number);
  const groups = groupLinesByPoSupplier(linesToOrder);
  const fabricOrders: PurchaseOrder[] = [];

  for (const [supplierId, lines] of groups) {
    const supplier = getSupplierByIdFromContactsSync(supplierId);
    if (!supplier) {
      throw new Error(`Unknown supplier: ${supplierId}`);
    }

    const po = createStoredFabricOrder({
      supplier_id: supplierId,
      client_reference: clientReference,
      sales_order_id: salesOrderId,
      supplier,
      lines: lines.map((line) => ({
        fabric_number: line.fabric_number,
        quantity_ordered: line.quantity,
        unit_price: line.unit_price,
        label_count: line.label_count,
        label_stickers: line.label_stickers,
        garment_type: line.garment_type,
        client_reference: clientReference,
      })),
    });

    fabricOrders.push(po);
  }

  const nextPoIds = [...new Set([...salesOrder.fabric_po_ids, ...fabricOrders.map((po) => po.id)])];

  const updatedOrders = store.orders.map((order) =>
    order.id === salesOrderId
      ? {
          ...order,
          client_reference: clientReference,
          status: "fabric_pos_created" as const,
          fabric_po_ids: nextPoIds,
        }
      : order
  );

  const saved = await writeSalesOrders({ ...store, orders: updatedOrders });
  const order = saved.orders.find((item) => item.id === salesOrderId);
  if (!order) {
    throw new Error("Failed to update sales order.");
  }

  return { order, fabricOrders };
}

export function getSalesOrderWithPos(salesOrderId: string) {
  const order = getSalesOrderById(salesOrderId);
  if (!order) return null;
  return order;
}
