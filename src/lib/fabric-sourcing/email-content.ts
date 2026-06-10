import type { FabricOrderEmail, PurchaseOrder, Supplier, SupplierFabric } from "@/lib/types/fabric-sourcing";
import {
  clientCodeFromReference,
  formatSupplierStickerCode,
  supplierFabricProductionCode,
} from "@/lib/sales-orders/label-codes";
import {
  formatShipToForEmail,
  getDeliveryDestination,
  type DeliveryDestination,
} from "@/lib/shipping/delivery-destinations";

/**
 * Addresses that should be CC'd on every supplier fabric-order email.
 * Change this list to update the always-CC recipients everywhere the email
 * is assembled (in-app draft, mailto link, copy output, and SMTP send).
 */
export const SUPPLIER_EMAIL_ALWAYS_CC = ["rhrahme@gmail.com"] as const;

export function resolveSupplierCc(extra?: string[] | string | null): string {
  const fromExtra =
    typeof extra === "string"
      ? extra.split(/[\n,;]+/)
      : Array.isArray(extra)
        ? extra
        : [];
  const all = [...SUPPLIER_EMAIL_ALWAYS_CC, ...fromExtra]
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(all)].join(", ");
}

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
  const cc = resolveSupplierCc();
  const from = fromEmail?.trim() || undefined;

  const lineRows = lines
    .map((line) => {
      const quantityWithUnit = formatQuantityWithUnit(line.quantity, line.unit);
      const firstSticker = line.labelStickers?.[0];
      // One short code per fabric cut — client code + brand-less production code,
      // so the brand prefix appears once: e.g. "FR-0626-0032 / 0104-L07".
      const stickerCode = firstSticker
        ? formatSupplierStickerCode(clientCode, supplierFabricProductionCode(firstSticker.code, clientCode))
        : clientCode;
      return `  ${line.fabricNumber.padEnd(16)} ${stickerCode.padEnd(28)} ${String(line.labelCount).padEnd(8)} ${quantityWithUnit}`;
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
Print one sticker per fabric cut with the code below (client code / production code).

Fabric No.       Code                         Labels   Quantity
────────────────────────────────────────────────────────────────────
${lineRows}

Please confirm availability and advise expected shipping date.
Provide AWB once dispatched.

${notes ? `Notes:\n${notes}\n\n` : ""}Thank you,
${from ?? "[Your Factory Name]"}`;

  return {
    from,
    to,
    cc,
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

function mapPoLinesToEmailLines(po: PurchaseOrder, fabrics: SupplierFabric[]): EmailLine[] {
  return (po.lines ?? []).map((line) => {
    const fabric = fabrics.find((f) => f.fabric_number === line.fabric_number);
    return {
      fabricNumber: line.fabric_number ?? "—",
      quantity: line.quantity_ordered,
      unit: fabric?.unit ?? "meters",
      labelCount: line.label_count ?? line.label_stickers?.length ?? 1,
      labelStickers: line.label_stickers ?? undefined,
    };
  });
}

export interface BatchOrderSection {
  clientCode: string;
  poNumber: string;
  soNumber?: string | null;
  deliveryDestination?: DeliveryDestination | null;
  lines: EmailLine[];
}

function formatEmailLineRows(lines: EmailLine[], clientCode: string): string {
  return lines
    .map((line) => {
      const quantityWithUnit = formatQuantityWithUnit(line.quantity, line.unit);
      const firstSticker = line.labelStickers?.[0];
      const stickerCode = firstSticker
        ? formatSupplierStickerCode(clientCode, supplierFabricProductionCode(firstSticker.code, clientCode))
        : clientCode;
      return `  ${line.fabricNumber.padEnd(16)} ${stickerCode.padEnd(28)} ${String(line.labelCount).padEnd(8)} ${quantityWithUnit}`;
    })
    .join("\n");
}

export function buildFabricOrderBatchEmail(params: {
  supplierName: string;
  supplierEmail?: string;
  supplierEmails?: string[];
  fromEmail?: string | null;
  sections: BatchOrderSection[];
  notes?: string;
}): FabricOrderEmail {
  const { supplierName, supplierEmail, supplierEmails, fromEmail, sections, notes } = params;
  const to = resolveSupplierEmails(supplierEmail, supplierEmails);
  const cc = resolveSupplierCc();
  const from = fromEmail?.trim() || undefined;

  const sectionsText = sections
    .map((section) => {
      const destination = section.deliveryDestination
        ? getDeliveryDestination(section.deliveryDestination)
        : undefined;
      const deliveryLine = destination
        ? formatShipToForEmail(destination)
        : "Shipping to: (select RUH or DXB on the sales order)";
      const header = section.soNumber
        ? `${section.clientCode} · ${section.soNumber} (PO: ${section.poNumber})`
        : `${section.clientCode} (PO: ${section.poNumber})`;

      return `${header}
${deliveryLine}

Fabric No.       Code                         Labels   Quantity
────────────────────────────────────────────────────────────────────
${formatEmailLineRows(section.lines, section.clientCode)}`;
    })
    .join("\n\n");

  const subject =
    sections.length === 1
      ? `Fabric Order ${sections[0]!.poNumber} — ${sections[0]!.clientCode}`
      : `Fabric Orders — ${supplierName} (${sections.length} orders)`;

  const body = `Dear ${supplierName},

Please supply the following fabrics:

${sectionsText}

Please confirm availability and advise expected shipping date.
Provide AWB once dispatched.

${notes ? `Notes:\n${notes}\n\n` : ""}Thank you,
${from ?? "[Your Factory Name]"}`;

  return { from, to, cc, subject, body };
}

export function purchaseOrderToEmail(
  po: PurchaseOrder,
  fabrics: SupplierFabric[],
  options?: { clientCode?: string; deliveryDestination?: DeliveryDestination | null; fromEmail?: string | null }
): FabricOrderEmail {
  const clientCode =
    options?.clientCode ??
    (po.client_reference ? clientCodeFromReference(po.client_reference) : "—");

  return buildFabricOrderEmail({
    supplierName: po.supplier?.name ?? "Supplier",
    supplierEmail: po.email_to ?? po.supplier?.email ?? "",
    supplierEmails: po.supplier?.emails,
    fromEmail: options?.fromEmail,
    clientCode,
    poNumber: po.po_number,
    deliveryDestination: options?.deliveryDestination,
    lines: mapPoLinesToEmailLines(po, fabrics),
  });
}

export function purchaseOrdersBatchToEmail(
  orders: PurchaseOrder[],
  fabrics: SupplierFabric[],
  options?: {
    clientCodeByPoId?: Record<string, string>;
    deliveryDestinationByPoId?: Record<string, DeliveryDestination | null>;
    soNumberByPoId?: Record<string, string | null>;
    fromEmail?: string | null;
  }
): FabricOrderEmail {
  const first = orders[0];
  if (!first) {
    throw new Error("At least one purchase order is required.");
  }

  const sections: BatchOrderSection[] = orders.map((po) => {
    const clientCode =
      options?.clientCodeByPoId?.[po.id] ??
      (po.client_reference ? clientCodeFromReference(po.client_reference) : "—");

    return {
      clientCode,
      poNumber: po.po_number,
      soNumber: options?.soNumberByPoId?.[po.id] ?? null,
      deliveryDestination: options?.deliveryDestinationByPoId?.[po.id] ?? null,
      lines: mapPoLinesToEmailLines(po, fabrics),
    };
  });

  return buildFabricOrderBatchEmail({
    supplierName: first.supplier?.name ?? "Supplier",
    supplierEmail: first.email_to ?? first.supplier?.email ?? "",
    supplierEmails: first.supplier?.emails,
    fromEmail: options?.fromEmail,
    sections,
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
