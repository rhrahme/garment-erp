import { clientCodeFromReference } from "@/lib/sales-orders/label-codes";
import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";
import type { SalesOrder } from "@/lib/types/sales-orders";

export function soNumberFromClientReference(clientReference: string | null | undefined): string | null {
  if (!clientReference) return null;
  const match = clientReference.match(/SO-\d{4}-\d{4,}$/);
  return match ? match[0]! : null;
}

function fabricNumbersForPo(po: PurchaseOrder): Set<string> {
  return new Set(
    (po.lines ?? [])
      .map((line) => line.fabric_number?.trim())
      .filter((value): value is string => Boolean(value))
  );
}

function fabricNumbersForSalesOrder(order: SalesOrder): Set<string> {
  return new Set(order.fabric_lines.map((line) => line.fabric_number.trim()).filter(Boolean));
}

/** Match orphaned POs to an open sales order with the same client and fabric lines. */
export function findMatchingSalesOrderForOrphanPos(
  pos: PurchaseOrder[],
  salesOrders: SalesOrder[]
): SalesOrder | undefined {
  if (pos.length === 0) return undefined;

  const clientCode = pos[0]?.client_reference ? clientCodeFromReference(pos[0].client_reference) : null;
  if (!clientCode) return undefined;

  const poFabrics = new Set<string>();
  for (const po of pos) {
    for (const fabric of fabricNumbersForPo(po)) {
      poFabrics.add(fabric);
    }
  }
  if (poFabrics.size === 0) return undefined;

  for (const candidate of salesOrders) {
    if (candidate.client_code !== clientCode) continue;
    if (candidate.fabric_po_ids.length > 0) continue;
    if (candidate.fabric_lines.length === 0) continue;

    const soFabrics = fabricNumbersForSalesOrder(candidate);
    if (poFabrics.size !== soFabrics.size) continue;
    if ([...poFabrics].every((fabric) => soFabrics.has(fabric))) {
      return candidate;
    }
  }

  return undefined;
}

export function resolveSupplierEmailMetadata(
  order: PurchaseOrder,
  salesOrder: SalesOrder | undefined
): {
  client_code: string | null;
  so_number: string | null;
  delivery_destination: DeliveryDestination | null;
} {
  return {
    client_code:
      salesOrder?.client_code ??
      (order.client_reference ? clientCodeFromReference(order.client_reference) : null),
    so_number: salesOrder?.so_number ?? soNumberFromClientReference(order.client_reference),
    delivery_destination: salesOrder?.delivery_destination ?? null,
  };
}
