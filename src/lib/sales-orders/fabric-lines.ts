import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesOrders, writeSalesOrders } from "@/lib/data/sales-orders";
import { getSupplierByIdFromContacts } from "@/lib/data/supplier-contacts";
import { fabricPoSupplierId, normalizeFabricSupplierFields } from "@/lib/fabric-sourcing/supplier-display";
import { generateFabricLabelStickers, getGarmentPieces } from "@/lib/sales-orders/label-codes";
import { isGarmentStitchType } from "@/lib/sales-orders/garment-types";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

export type FabricLinePrintKind = "a4" | "prep_stickers" | "prod_stickers";

const PRINT_FIELD: Record<FabricLinePrintKind, keyof SalesOrderFabricLine> = {
  a4: "a4_printed_at",
  prep_stickers: "prep_stickers_printed_at",
  prod_stickers: "prod_stickers_printed_at",
};

/** Original order lines (pre-incremental-print) have no added_at — treat as already printed. */
export function isLegacyFabricLine(line: SalesOrderFabricLine): boolean {
  return !line.added_at;
}

export function isFabricLinePrinted(line: SalesOrderFabricLine, kind: FabricLinePrintKind): boolean {
  if (isLegacyFabricLine(line)) return true;
  return Boolean(line[PRINT_FIELD[kind]]);
}

export function getUnprintedFabricLines(
  lines: SalesOrderFabricLine[],
  kind: FabricLinePrintKind
): SalesOrderFabricLine[] {
  return lines.filter((line) => !isFabricLinePrinted(line, kind));
}

/** Multi-piece garments need separate production piece stickers at cutting. */
export function getFabricLinesForProdStickers(lines: SalesOrderFabricLine[]): SalesOrderFabricLine[] {
  return lines.filter((line) => getGarmentPieces(line.garment_type).length > 1);
}

export function orderWithFabricLines(order: SalesOrder, lines: SalesOrderFabricLine[]): SalesOrder {
  return { ...order, fabric_lines: lines };
}

export function markFabricLinesPrinted(
  lines: SalesOrderFabricLine[],
  lineIds: string[],
  kind: FabricLinePrintKind,
  printedAt = new Date().toISOString()
): SalesOrderFabricLine[] {
  const idSet = new Set(lineIds);
  const field = PRINT_FIELD[kind];
  return lines.map((line) =>
    idSet.has(line.id) && !line[field] ? { ...line, [field]: printedAt } : line
  );
}

export function resolvePrintLineIds(
  order: Pick<SalesOrder, "fabric_lines">,
  kind: FabricLinePrintKind,
  lineIds?: string[]
): string[] {
  if (lineIds && lineIds.length > 0) return lineIds;
  const pool =
    kind === "prod_stickers"
      ? getFabricLinesForProdStickers(order.fabric_lines)
      : order.fabric_lines;
  return getUnprintedFabricLines(pool, kind).map((line) => line.id);
}

export type FabricLineInput = {
  garment_type: string;
  label_count?: number;
  supplier_id: string;
  supplier_name?: string;
  fabric_number: string;
  quantity: number;
  unit?: string;
  unit_price?: number;
  composition?: string | null;
  weight_gsm?: number | null;
  width_cm?: number | null;
  width_inches?: number | null;
  color?: string | null;
  stock_status?: "in_stock" | "temp_unavailable" | "permanently_unavailable" | null;
  restock_date?: string | null;
  needs_replacement?: boolean;
  replacement_fabric_number?: string | null;
};

export function canAppendFabricLines(
  order: Pick<SalesOrder, "status" | "fabric_po_ids" | "retail_brand">
): boolean {
  if (order.retail_brand?.trim()) return false;
  if (order.status !== "open") return false;
  if (order.fabric_po_ids.length > 0) return false;
  return true;
}

export function resolveOrderClientReference(order: Pick<SalesOrder, "client_code" | "so_number" | "client_reference">): string {
  if (order.client_reference?.trim()) return order.client_reference.trim();
  return `${order.client_code}-${order.so_number}`;
}

export function buildFabricLineFromInput(
  line: FabricLineInput,
  clientReference: string,
  lineIndex: number,
  options: { lineId?: string; addedAt?: string; addedBy?: string | null } = {}
): SalesOrderFabricLine | { error: string } {
  const supplier_id = String(line.supplier_id ?? "").trim();
  const fabric_number = String(line.fabric_number ?? "").trim();
  const quantity = Number(line.quantity);

  if (!supplier_id || !fabric_number || !Number.isFinite(quantity) || quantity <= 0) {
    return { error: "Each fabric line needs supplier, fabric number, and quantity." };
  }

  const poSupplierId = fabricPoSupplierId(supplier_id, fabric_number);
  const supplier = getSupplierByIdFromContacts(poSupplierId) ?? getSupplierByIdFromContacts(supplier_id);
  if (!supplier) {
    return { error: `Unknown supplier: ${supplier_id}` };
  }

  const garment_type = String(line.garment_type ?? "").trim();
  if (!garment_type) {
    return { error: "Each fabric line needs a garment type." };
  }
  if (!isGarmentStitchType(garment_type)) {
    return { error: `Invalid garment type: ${garment_type}` };
  }

  const label_stickers = generateFabricLabelStickers(clientReference, lineIndex, garment_type);
  const label_count = label_stickers.length;

  const supplierFields = normalizeFabricSupplierFields(
    supplier_id,
    line.supplier_name ?? supplier.name,
    fabric_number
  );

  const addedAt = options.addedAt ?? new Date().toISOString();

  return {
    id: options.lineId ?? `line-${Date.now()}-${lineIndex}`,
    garment_type,
    label_count,
    label_stickers,
    supplier_id: supplierFields.supplier_id,
    supplier_name: supplierFields.supplier_name,
    fabric_number,
    quantity,
    unit: line.unit?.trim() || "meters",
    unit_price: Number(line.unit_price) || 0,
    composition: line.composition ?? null,
    weight_gsm: line.weight_gsm ?? null,
    width_cm: line.width_cm ?? null,
    width_inches: line.width_inches ?? null,
    color: line.color ?? null,
    stock_status: line.stock_status ?? null,
    restock_date: line.restock_date ?? null,
    needs_replacement: Boolean(line.needs_replacement),
    replacement_fabric_number: line.replacement_fabric_number ?? null,
    added_at: addedAt,
    added_by: options.addedBy ?? null,
    prep_stickers_printed_at: null,
    prod_stickers_printed_at: null,
    a4_printed_at: null,
  };
}

export function buildFabricLinesFromInputs(
  inputs: FabricLineInput[],
  order: Pick<SalesOrder, "client_code" | "so_number" | "client_reference" | "fabric_lines">,
  startLineIndex = order.fabric_lines.length,
  options: { addedAt?: string; addedBy?: string | null } = {}
): { lines: SalesOrderFabricLine[] } | { error: string } {
  const clientReference = resolveOrderClientReference(order);
  const lines: SalesOrderFabricLine[] = [];
  const addedAt = options.addedAt ?? new Date().toISOString();

  for (const [offset, input] of inputs.entries()) {
    const built = buildFabricLineFromInput(input, clientReference, startLineIndex + offset + 1, {
      addedAt,
      addedBy: options.addedBy ?? null,
    });
    if ("error" in built) return { error: built.error };
    lines.push(built);
  }

  return { lines };
}

export async function appendSalesOrderFabricLines(
  orderId: string,
  inputs: FabricLineInput[],
  options: { addedBy?: string | null } = {}
): Promise<
  | { ok: true; order: SalesOrder; added_lines: SalesOrderFabricLine[] }
  | { ok: false; status: number; error: string }
> {
  await ensureDocumentsLoaded(["sales_orders"]);

  const store = readSalesOrders();
  const index = store.orders.findIndex((order) => order.id === orderId);
  if (index < 0) {
    return { ok: false, status: 404, error: "Sales order not found." };
  }

  const order = store.orders[index]!;
  if (!canAppendFabricLines(order)) {
    const error =
      order.retail_brand?.trim()
        ? "Ready-made retail orders cannot have fabrics appended."
        : order.fabric_po_ids.length > 0
          ? "Cannot add fabrics — supplier fabric orders were already created for this order."
          : "This order is closed — fabrics can only be added while the order is open.";
    return { ok: false, status: 409, error };
  }

  if (inputs.length === 0) {
    return { ok: false, status: 400, error: "Add at least one fabric line." };
  }

  const built = buildFabricLinesFromInputs(inputs, order, order.fabric_lines.length, {
    addedBy: options.addedBy ?? null,
  });
  if ("error" in built) {
    return { ok: false, status: 400, error: built.error };
  }

  store.orders[index] = {
    ...order,
    fabric_lines: [...order.fabric_lines, ...built.lines],
  };

  const saved = await writeSalesOrders(store);
  const updated = saved.orders.find((item) => item.id === orderId)!;

  return { ok: true, order: updated, added_lines: built.lines };
}
