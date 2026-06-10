import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSupplierByIdFromContacts } from "@/lib/data/supplier-contacts";
import { fabricPoSupplierId } from "@/lib/fabric-sourcing/supplier-display";
import { buildClientReference, getSalesOrderById, writeSalesOrders, readSalesOrders } from "@/lib/data/sales-orders";
import { createStoredFabricOrder } from "@/lib/integrations/fabric-order-store";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

function groupLinesBySupplier(lines: SalesOrderFabricLine[]): Map<string, SalesOrderFabricLine[]> {
  const groups = new Map<string, SalesOrderFabricLine[]>();
  for (const line of lines) {
    const poSupplierId = fabricPoSupplierId(line.supplier_id, line.fabric_number);
    const bucket = groups.get(poSupplierId) ?? [];
    bucket.push(line);
    groups.set(poSupplierId, bucket);
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
  await ensureDocumentsLoaded(["sales_orders", "fabric_orders"]);

  const store = readSalesOrders();
  const salesOrder = store.orders.find((order) => order.id === salesOrderId);
  if (!salesOrder) {
    throw new Error("Sales order not found.");
  }
  if (salesOrder.fabric_lines.length === 0) {
    throw new Error("Add at least one fabric line to the sales order.");
  }

  const clientReference = buildClientReference(salesOrder.client_code, salesOrder.so_number);
  const groups = groupLinesBySupplier(salesOrder.fabric_lines);
  const fabricOrders: PurchaseOrder[] = [];

  for (const [supplierId, lines] of groups) {
    const supplier = getSupplierByIdFromContacts(supplierId);
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

  const updatedOrders = store.orders.map((order) =>
    order.id === salesOrderId
      ? {
          ...order,
          client_reference: clientReference,
          status: "fabric_pos_created" as const,
          fabric_po_ids: fabricOrders.map((po) => po.id),
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
