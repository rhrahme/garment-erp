import type { FabricOrderEmail, PurchaseOrder, Supplier, SupplierFabric } from "@/lib/types/fabric-sourcing";
import { clientCodeFromReference, supplierFabricProductionCode } from "@/lib/sales-orders/label-codes";
import {
  formatShipToForEmail,
  getDeliveryDestination,
  type DeliveryDestination,
} from "@/lib/shipping/delivery-destinations";

interface EmailLine {
  fabricNumber: string;
  quantity: number;
  unit: string;
  labelCount: number;
  labelStickers?: Array<{ code: string; piece_name: string }>;
}

export function resolveSupplierEmails(supplierEmail?: string | null, supplierEmails?: string[]): string {
  if (supplierEmails && supplierEmails.length > 0) {
    return supplierEmails.join(", ");
  }
  return supplierEmail?.trim() ?? "";
}

function formatQuantityWithUnit(quantity: number, unit: string): string {
  const value =
    Number.isFinite(quantity) && quantity === Math.floor(quantity)
      ? String(Math.floor(quantity))
      : String(quantity);
  return `${value} ${unit}`;
}

export function buildFabricOrderEmail(params: {
  supplierName: string;
  supplierEmail?: string;
  supplierEmails?: string[];
  fromEmail?: string | null;
  clientCode: string;
  poNumber: string;
  deliveryDestination?: DeliveryDestination | null;
  lines: EmailLine[];
  notes?: string;
}): FabricOrderEmail {
  const { supplierName, supplierEmail, supplierEmails, fromEmail, clientCode, poNumber, deliveryDestination, lines, notes } =
    params;
  const to = resolveSupplierEmails(supplierEmail, supplierEmails);
  const from = fromEmail?.trim() || undefined;

  const lineRows = lines
    .map((line) => {
      const quantityWithUnit = formatQuantityWithUnit(line.quantity, line.unit);
      const firstSticker = line.labelStickers?.[0];
      const productionCode = firstSticker
        ? supplierFabricProductionCode(firstSticker.code, clientCode)
        : "—";
      return `  ${line.fabricNumber.padEnd(16)} ${clientCode.padEnd(16)} ${productionCode.padEnd(16)} ${String(line.labelCount).padEnd(8)} ${quantityWithUnit}`;
    })
    .join("\n");

  const destination = deliveryDestination ? getDeliveryDestination(deliveryDestination) : undefined;
  const deliverySection = destination
    ? `\n${formatShipToForEmail(destination)}\n`
    : "\nShipping to: (select RUH or DXB on the sales order)\n";

  const body = `Dear ${supplierName},

Please supply the following fabrics:

PO: ${poNumber}
${deliverySection}
Print one sticker per fabric cut with client code + production code.

Fabric No.       Client           Production code  Labels   Quantity
────────────────────────────────────────────────────────────────────
${lineRows}
${lines.some((line) => /^S/i.test(line.fabricNumber)) ? "\nNote: fabrics starting with S are Solbiati (linen line).\n" : ""}
Please confirm availability and advise expected shipping date.
Provide AWB once dispatched.

${notes ? `Notes:\n${notes}\n\n` : ""}Thank you,
${from ?? "[Your Factory Name]"}`;

  return {
    from,
    to,
    subject: `Fabric Order ${poNumber} — ${clientCode}`,
    body,
  };
}

export function supplierToOrderEmail(supplier: Supplier): string {
  return resolveSupplierEmails(supplier.email, supplier.emails);
}

export function fabricSpecsSummary(fabric: SupplierFabric): string {
  const parts: string[] = [];
  if (fabric.composition) parts.push(fabric.composition);
  if (fabric.description) parts.push(fabric.description);
  if (fabric.weight_gsm) parts.push(`${fabric.weight_gsm}gsm`);
  if (fabric.width_cm) parts.push(`${fabric.width_cm}cm wide`);
  else if (fabric.width_inches) parts.push(`${fabric.width_inches}" wide`);
  if (fabric.color) parts.push(fabric.color);
  if (fabric.finish) parts.push(fabric.finish);
  return parts.join(", ") || "—";
}

export function purchaseOrderToEmail(
  po: PurchaseOrder,
  fabrics: SupplierFabric[],
  options?: { clientCode?: string; deliveryDestination?: DeliveryDestination | null; fromEmail?: string | null }
): FabricOrderEmail {
  const clientCode =
    options?.clientCode ??
    (po.client_reference ? clientCodeFromReference(po.client_reference) : "—");

  const lines: EmailLine[] = (po.lines ?? []).map((line) => {
    const fabric = fabrics.find((f) => f.fabric_number === line.fabric_number);
    return {
      fabricNumber: line.fabric_number ?? "—",
      quantity: line.quantity_ordered,
      unit: fabric?.unit ?? "meters",
      labelCount: line.label_count ?? line.label_stickers?.length ?? 1,
      labelStickers: line.label_stickers ?? undefined,
    };
  });

  return buildFabricOrderEmail({
    supplierName: po.supplier?.name ?? "Supplier",
    supplierEmail: po.email_to ?? po.supplier?.email ?? "",
    supplierEmails: po.supplier?.emails,
    fromEmail: options?.fromEmail,
    clientCode,
    poNumber: po.po_number,
    deliveryDestination: options?.deliveryDestination,
    lines,
  });
}

/** Expected columns when importing a supplier price list CSV/Excel */
export const PRICE_LIST_IMPORT_COLUMNS = [
  { key: "fabric_number", label: "Fabric Number", required: true },
  { key: "name", label: "Fabric Name", required: false },
  { key: "composition", label: "Composition", required: false },
  { key: "weight_gsm", label: "Weight (GSM)", required: false },
  { key: "width_cm", label: "Width (cm)", required: false },
  { key: "width_inches", label: 'Width (inches)', required: false },
  { key: "color", label: "Color", required: false },
  { key: "finish", label: "Finish", required: false },
  { key: "weave_type", label: "Weave Type", required: false },
  { key: "unit_price", label: "Unit Price", required: true },
  { key: "unit", label: "Unit (meters/yards/kg)", required: false },
  { key: "min_order_qty", label: "Min Order Qty", required: false },
  { key: "lead_time_days", label: "Lead Time (days)", required: false },
] as const;

export type PriceListImportRow = Partial<Record<(typeof PRICE_LIST_IMPORT_COLUMNS)[number]["key"], string>>;

export function parsePriceListRow(row: PriceListImportRow, supplierId: string): Omit<SupplierFabric, "id" | "supplier"> {
  return {
    supplier_id: supplierId,
    fabric_number: String(row.fabric_number ?? "").trim(),
    name: row.name?.trim() || null,
    composition: row.composition?.trim() || null,
    weight_gsm: row.weight_gsm ? parseFloat(row.weight_gsm) : null,
    width_cm: row.width_cm ? parseFloat(row.width_cm) : null,
    width_inches: row.width_inches ? parseFloat(row.width_inches) : null,
    color: row.color?.trim() || null,
    finish: row.finish?.trim() || null,
    weave_type: row.weave_type?.trim() || null,
    unit: row.unit?.trim() || "meters",
    unit_price: parseFloat(row.unit_price ?? "0"),
    min_order_qty: row.min_order_qty ? parseFloat(row.min_order_qty) : null,
    lead_time_days: row.lead_time_days ? parseInt(row.lead_time_days, 10) : null,
    is_active: true,
  };
}
