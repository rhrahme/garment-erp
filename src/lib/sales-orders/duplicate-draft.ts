import type { SalesOrderLineDraft } from "@/lib/autosave/sales-order-draft";
import {
  isSolbiatiFabric,
  normalizeFabricSupplierFields,
} from "@/lib/fabric-sourcing/supplier-display";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";
import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";

export type SalesOrderDuplicateSeed = {
  deliveryDestination: DeliveryDestination | "";
  deliveryDate: string;
  notes: string;
  lines: SalesOrderLineDraft[];
};


export function fabricLineToDraftLine(line: SalesOrderFabricLine, index: number): SalesOrderLineDraft {
  const normalized = normalizeFabricSupplierFields(
    line.supplier_id,
    line.supplier_name,
    line.fabric_number
  );

  return {
    id: `copy-${line.id}`,
    lineId: `line-dup-${Date.now()}-${index}-${normalized.fabric_number}`,
    supplier_id: normalized.supplier_id,
    supplier_name: normalized.supplier_name,
    fabric_number: line.fabric_number,
    composition: line.composition,
    color: line.color,
    weight_gsm: line.weight_gsm,
    width_cm: line.width_cm,
    width_inches: line.width_inches,
    unit_price: line.unit_price,
    unit: line.unit,
    mill_line: isSolbiatiFabric(normalized.supplier_id, line.fabric_number) ? "solbiati" : null,
    manual: line.unit_price == null || line.unit_price === 0,
    garment_type: line.garment_type,
    label_count: line.label_count,
    meters: String(line.quantity),
    stock_status: line.stock_status ?? null,
    restock_date: line.restock_date ?? null,
    needs_replacement: line.needs_replacement ?? false,
    replacement_fabric_number: line.replacement_fabric_number ?? null,
  };
}

export function salesOrderToDuplicateSeed(order: SalesOrder): SalesOrderDuplicateSeed {
  return {
    deliveryDestination: order.delivery_destination ?? "",
    deliveryDate: order.delivery_date ?? "",
    notes: order.notes ?? "",
    lines: order.fabric_lines.map(fabricLineToDraftLine),
  };
}
