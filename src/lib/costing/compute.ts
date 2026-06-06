import { getSupplierPriceCurrency, toSar } from "@/lib/currency/config";
import { computeFabricImportCost } from "@/lib/costing/fabric-import";
import { listBespokeSalesOrders, readSalesOrders } from "@/lib/data/sales-orders";
import { dedupeIdenticalSalesOrders } from "@/lib/sales-orders/duplicate-order";
import { isSalesOrderArchived } from "@/lib/sales-orders/archive";
import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import { getGarmentCostRate } from "@/lib/costing/rates";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

function formatFabricWidth(line: SalesOrderFabricLine): string | null {
  if (line.width_cm != null) return `${line.width_cm} cm`;
  if (line.width_inches != null) return `${line.width_inches}"`;
  return null;
}

export type FabricLineCost = {
  line_id: string;
  article_number: number;
  fabric_number: string;
  supplier_id: string;
  supplier_name: string;
  garment_type: string;
  composition: string | null;
  weight_gsm: number | null;
  width_label: string | null;
  color: string | null;
  meters: number;
  unit_price: number | null;
  /** Supplier currency total = unit price × meters ordered. */
  supplier_line_total: number | null;
  fabric_base_sar: number | null;
  customs_duty_sar: number;
  import_vat_sar: number;
  vat_recoverable_sar: number;
  fabric_cash_outlay_sar: number | null;
  fabric_cost_sar: number | null;
  labor_cost_sar: number;
  washing_cost_sar: number;
  overhead_cost_sar: number;
  total_cost_sar: number | null;
  has_fabric_price: boolean;
};

export type SalesOrderCost = {
  order_id: string;
  so_number: string;
  client_name: string;
  client_code: string;
  client_reference: string | null;
  product_article: string | null;
  order_date: string;
  status: SalesOrder["status"];
  is_archived: boolean;
  line_count: number;
  lines_missing_price: number;
  fabric_base_sar: number;
  customs_duty_sar: number;
  import_vat_sar: number;
  vat_recoverable_sar: number;
  fabric_cash_outlay_sar: number;
  fabric_cost_sar: number;
  labor_cost_sar: number;
  washing_cost_sar: number;
  overhead_cost_sar: number;
  total_cost_sar: number | null;
  lines: FabricLineCost[];
};

export type CostingOverview = {
  currency: "SAR";
  order_count: number;
  line_count: number;
  lines_missing_price: number;
  fabric_base_sar: number;
  customs_duty_sar: number;
  import_vat_sar: number;
  vat_recoverable_sar: number;
  fabric_cash_outlay_sar: number;
  fabric_cost_sar: number;
  labor_cost_sar: number;
  washing_cost_sar: number;
  overhead_cost_sar: number;
  total_cost_sar: number | null;
  orders: SalesOrderCost[];
};

function fabricLineBaseSar(line: SalesOrderFabricLine): number | null {
  if (line.unit_price == null || line.unit_price <= 0) return null;
  const currency = getSupplierPriceCurrency(line.supplier_id);
  return toSar(line.unit_price * line.quantity, currency);
}

function buildLineCost(line: SalesOrderFabricLine, articleNumber: number): FabricLineCost {
  const rates = getGarmentCostRate(line.garment_type);
  const fabricBase = fabricLineBaseSar(line);
  const unitPrice = line.unit_price > 0 ? line.unit_price : null;
  const supplierLineTotal =
    unitPrice != null && line.quantity > 0 ? Math.round(unitPrice * line.quantity * 100) / 100 : null;
  const importCost =
    fabricBase != null ? computeFabricImportCost(fabricBase, line.supplier_id) : null;
  const fabricCost = importCost?.fabric_cost_sar ?? null;
  const labor = rates.labor;
  const washing = rates.washing;
  const overhead = rates.overhead;
  const total =
    fabricCost == null ? null : Math.round((fabricCost + labor + washing + overhead) * 100) / 100;

  return {
    line_id: line.id,
    article_number: articleNumber,
    fabric_number: line.fabric_number,
    supplier_id: line.supplier_id,
    supplier_name: formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number),
    garment_type: line.garment_type,
    composition: line.composition,
    weight_gsm: line.weight_gsm,
    width_label: formatFabricWidth(line),
    color: line.color,
    meters: line.quantity,
    unit_price: unitPrice,
    supplier_line_total: supplierLineTotal,
    fabric_base_sar: importCost?.fabric_base_sar ?? null,
    customs_duty_sar: importCost?.customs_duty_sar ?? 0,
    import_vat_sar: importCost?.import_vat_sar ?? 0,
    vat_recoverable_sar: importCost?.vat_recoverable_sar ?? 0,
    fabric_cash_outlay_sar: importCost?.fabric_cash_outlay_sar ?? null,
    fabric_cost_sar: fabricCost == null ? null : Math.round(fabricCost * 100) / 100,
    labor_cost_sar: labor,
    washing_cost_sar: washing,
    overhead_cost_sar: overhead,
    total_cost_sar: total,
    has_fabric_price: fabricCost != null,
  };
}

export function getSalesOrderCost(order: SalesOrder): SalesOrderCost {
  const lines = order.fabric_lines.map((line, index) => buildLineCost(line, index + 1));
  const linesMissingPrice = lines.filter((line) => !line.has_fabric_price).length;
  const fabricBase = lines.reduce((sum, line) => sum + (line.fabric_base_sar ?? 0), 0);
  const customsDuty = lines.reduce((sum, line) => sum + line.customs_duty_sar, 0);
  const importVat = lines.reduce((sum, line) => sum + line.import_vat_sar, 0);
  const vatRecoverable = lines.reduce((sum, line) => sum + line.vat_recoverable_sar, 0);
  const fabricCashOutlay = lines.reduce((sum, line) => sum + (line.fabric_cash_outlay_sar ?? 0), 0);
  const fabricCost = lines.reduce((sum, line) => sum + (line.fabric_cost_sar ?? 0), 0);
  const laborCost = lines.reduce((sum, line) => sum + line.labor_cost_sar, 0);
  const washingCost = lines.reduce((sum, line) => sum + line.washing_cost_sar, 0);
  const overheadCost = lines.reduce((sum, line) => sum + line.overhead_cost_sar, 0);
  const hasAllPrices = linesMissingPrice === 0 && lines.length > 0;
  const totalCost = hasAllPrices
    ? Math.round((fabricCost + laborCost + washingCost + overheadCost) * 100) / 100
    : linesMissingPrice === lines.length
      ? null
      : Math.round((fabricCost + laborCost + washingCost + overheadCost) * 100) / 100;

  return {
    order_id: order.id,
    so_number: order.so_number,
    client_name: order.client_name,
    client_code: order.client_code,
    client_reference: order.client_reference,
    product_article: order.product_article ?? null,
    order_date: order.order_date,
    status: order.status,
    is_archived: isSalesOrderArchived(order),
    line_count: lines.length,
    lines_missing_price: linesMissingPrice,
    fabric_base_sar: Math.round(fabricBase * 100) / 100,
    customs_duty_sar: Math.round(customsDuty * 100) / 100,
    import_vat_sar: Math.round(importVat * 100) / 100,
    vat_recoverable_sar: Math.round(vatRecoverable * 100) / 100,
    fabric_cash_outlay_sar: Math.round(fabricCashOutlay * 100) / 100,
    fabric_cost_sar: Math.round(fabricCost * 100) / 100,
    labor_cost_sar: laborCost,
    washing_cost_sar: washingCost,
    overhead_cost_sar: overheadCost,
    total_cost_sar: totalCost,
    lines,
  };
}

export function getCostingOverview(options?: { includeArchived?: boolean }): CostingOverview {
  const includeArchived = options?.includeArchived ?? false;
  let orders = listBespokeSalesOrders(readSalesOrders().orders);
  if (!includeArchived) {
    orders = orders.filter((order) => !isSalesOrderArchived(order));
  }

  orders.sort((a, b) => b.order_date.localeCompare(a.order_date));

  const dedupedOrders = dedupeIdenticalSalesOrders(orders);
  const computed = dedupedOrders.map(getSalesOrderCost);
  const lineCount = computed.reduce((sum, order) => sum + order.line_count, 0);
  const linesMissingPrice = computed.reduce((sum, order) => sum + order.lines_missing_price, 0);
  const fabricBase = computed.reduce((sum, order) => sum + order.fabric_base_sar, 0);
  const customsDuty = computed.reduce((sum, order) => sum + order.customs_duty_sar, 0);
  const importVat = computed.reduce((sum, order) => sum + order.import_vat_sar, 0);
  const vatRecoverable = computed.reduce((sum, order) => sum + order.vat_recoverable_sar, 0);
  const fabricCashOutlay = computed.reduce((sum, order) => sum + order.fabric_cash_outlay_sar, 0);
  const fabricCost = computed.reduce((sum, order) => sum + order.fabric_cost_sar, 0);
  const laborCost = computed.reduce((sum, order) => sum + order.labor_cost_sar, 0);
  const washingCost = computed.reduce((sum, order) => sum + order.washing_cost_sar, 0);
  const overheadCost = computed.reduce((sum, order) => sum + order.overhead_cost_sar, 0);
  const allLinesPriced = linesMissingPrice === 0 && lineCount > 0;

  return {
    currency: "SAR",
    order_count: computed.length,
    line_count: lineCount,
    lines_missing_price: linesMissingPrice,
    fabric_base_sar: Math.round(fabricBase * 100) / 100,
    customs_duty_sar: Math.round(customsDuty * 100) / 100,
    import_vat_sar: Math.round(importVat * 100) / 100,
    vat_recoverable_sar: Math.round(vatRecoverable * 100) / 100,
    fabric_cash_outlay_sar: Math.round(fabricCashOutlay * 100) / 100,
    fabric_cost_sar: Math.round(fabricCost * 100) / 100,
    labor_cost_sar: laborCost,
    washing_cost_sar: washingCost,
    overhead_cost_sar: overheadCost,
    total_cost_sar: allLinesPriced
      ? Math.round((fabricCost + laborCost + washingCost + overheadCost) * 100) / 100
      : lineCount === 0
        ? null
        : Math.round((fabricCost + laborCost + washingCost + overheadCost) * 100) / 100,
    orders: computed,
  };
}
