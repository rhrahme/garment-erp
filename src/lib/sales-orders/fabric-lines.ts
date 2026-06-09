import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesOrders, writeSalesOrders } from "@/lib/data/sales-orders";
import { getSupplierByIdFromContacts } from "@/lib/data/supplier-contacts";
import { resolveFabricItemFromCatalog } from "@/lib/fabric-sourcing/resolve-fabric-from-catalog";
import { fabricPoSupplierId, normalizeFabricSupplierFields } from "@/lib/fabric-sourcing/supplier-display";
import { generateFabricLabelStickers, getGarmentPieces } from "@/lib/sales-orders/label-codes";
import { isGarmentStitchType } from "@/lib/sales-orders/garment-types";
import {
  fabricArticleKey,
  findDuplicateFabricArticle,
  formatFabricArticleDuplicateError,
} from "@/lib/sales-orders/duplicate-order";
import { canAppendFabricLines, canEditFabricLines, fabricLineEditBlockedReason } from "@/lib/sales-orders/fabric-lines-rules";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";
import { PRINTING_FREE } from "@/lib/sales-orders/print-mode";

export { canAppendFabricLines, canEditFabricLines, fabricLineEditBlockedReason, PRINTING_FREE };

export type FabricLinePrintKind = "a4" | "prep_stickers" | "prod_stickers";

const PRINT_FIELD: Record<FabricLinePrintKind, keyof SalesOrderFabricLine> = {
  a4: "a4_printed_at",
  prep_stickers: "prep_stickers_printed_at",
  prod_stickers: "prod_stickers_printed_at",
};

/** Pre-incremental-print lines have no added_at — print state comes from timestamp fields only. */
export function isLegacyFabricLine(line: SalesOrderFabricLine): boolean {
  return !line.added_at;
}

export function isFabricLinePrinted(line: SalesOrderFabricLine, kind: FabricLinePrintKind): boolean {
  return Boolean(line[PRINT_FIELD[kind]]);
}

export function getUnprintedFabricLines(
  lines: SalesOrderFabricLine[],
  kind: FabricLinePrintKind
): SalesOrderFabricLine[] {
  return lines.filter((line) => !isFabricLinePrinted(line, kind));
}

function fabricLinePoolForPrintKind(
  lines: SalesOrderFabricLine[],
  kind: FabricLinePrintKind
): SalesOrderFabricLine[] {
  return kind === "prod_stickers" ? getFabricLinesForProdStickers(lines) : lines;
}

/** Lines included on a print sheet — all lines when PRINTING_FREE, else unprinted only. */
export function linesNeedingPrint(
  lines: SalesOrderFabricLine[],
  kind: FabricLinePrintKind
): SalesOrderFabricLine[] {
  const pool = fabricLinePoolForPrintKind(lines, kind);
  if (PRINTING_FREE) return pool;
  return getUnprintedFabricLines(pool, kind);
}

export function getFabricLineIdsForPrint(
  order: Pick<SalesOrder, "fabric_lines">,
  kind: FabricLinePrintKind
): string[] {
  return linesNeedingPrint(order.fabric_lines, kind).map((line) => line.id);
}

/** A4 receiving sheet — all lines when PRINTING_FREE, else unprinted only. */
export function getFabricLinesForA4Print(lines: SalesOrderFabricLine[]): SalesOrderFabricLine[] {
  if (PRINTING_FREE) return lines;
  return linesNeedingPrint(lines, "a4");
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
  return getFabricLineIdsForPrint(order, kind);
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

export type FabricLineUpdateInput = {
  line_id: string;
  garment_type?: string;
  supplier_id?: string;
  supplier_name?: string;
  fabric_number?: string;
  quantity?: number;
  unit_price?: number;
};

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

function validateNoDuplicateFabricArticles(
  existingLines: SalesOrderFabricLine[],
  candidates: Array<Pick<SalesOrderFabricLine, "garment_type" | "fabric_number" | "supplier_id" | "supplier_name">>,
  excludeLineId?: string
): string | null {
  const seenKeys = new Set<string>();

  for (const line of existingLines) {
    if (line.id !== excludeLineId) {
      seenKeys.add(fabricArticleKey(line));
    }
  }

  for (const candidate of candidates) {
    const key = fabricArticleKey(candidate);
    if (seenKeys.has(key)) {
      const duplicate =
        findDuplicateFabricArticle(existingLines, candidate, excludeLineId) ?? candidate;
      return formatFabricArticleDuplicateError(duplicate);
    }
    seenKeys.add(key);
  }

  return null;
}

export function buildFabricLinesFromInputs(
  inputs: FabricLineInput[],
  order: Pick<SalesOrder, "client_code" | "so_number" | "client_reference" | "fabric_lines">,
  startLineIndex = order.fabric_lines.length,
  options: { addedAt?: string; addedBy?: string | null } = {}
): { lines: SalesOrderFabricLine[] } | { error: string } {
  const duplicateError = validateNoDuplicateFabricArticles(order.fabric_lines, inputs);
  if (duplicateError) return { error: duplicateError };

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

  const duplicateError = validateNoDuplicateFabricArticles(order.fabric_lines, inputs);
  if (duplicateError) {
    return { ok: false, status: 409, error: duplicateError };
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

export async function updateSalesOrderFabricLine(
  orderId: string,
  input: FabricLineUpdateInput,
  options: { updatedBy?: string | null; allowPriceEdit?: boolean } = {}
): Promise<
  | { ok: true; order: SalesOrder; updated_line: SalesOrderFabricLine }
  | { ok: false; status: number; error: string }
> {
  await ensureDocumentsLoaded(["sales_orders"]);

  const lineId = String(input.line_id ?? "").trim();
  if (!lineId) {
    return { ok: false, status: 400, error: "line_id is required." };
  }

  const store = readSalesOrders();
  const index = store.orders.findIndex((order) => order.id === orderId);
  if (index < 0) {
    return { ok: false, status: 404, error: "Sales order not found." };
  }

  const order = store.orders[index]!;
  const blockedReason = fabricLineEditBlockedReason(order);
  if (blockedReason) {
    return { ok: false, status: 409, error: blockedReason };
  }

  const lineIndex = order.fabric_lines.findIndex((line) => line.id === lineId);
  if (lineIndex < 0) {
    return { ok: false, status: 404, error: "Fabric line not found on this order." };
  }

  const existing = order.fabric_lines[lineIndex]!;
  const nextSupplierId = String(input.supplier_id ?? existing.supplier_id).trim();
  const nextFabricNumber = String(input.fabric_number ?? existing.fabric_number).trim();
  const nextGarmentType = String(input.garment_type ?? existing.garment_type).trim();
  const nextQuantity = input.quantity != null ? Number(input.quantity) : existing.quantity;

  if (!nextSupplierId || !nextFabricNumber) {
    return { ok: false, status: 400, error: "Each fabric line needs supplier and fabric number." };
  }
  if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
    return { ok: false, status: 400, error: "Enter valid meters for this fabric line." };
  }
  if (!nextGarmentType) {
    return { ok: false, status: 400, error: "Each fabric line needs a garment type." };
  }
  if (!isGarmentStitchType(nextGarmentType)) {
    return { ok: false, status: 400, error: `Invalid garment type: ${nextGarmentType}` };
  }

  const supplierFieldsPreview = normalizeFabricSupplierFields(
    nextSupplierId,
    input.supplier_name ?? existing.supplier_name ?? "",
    nextFabricNumber
  );
  const duplicateError = validateNoDuplicateFabricArticles(
    order.fabric_lines,
    [
      {
        garment_type: nextGarmentType,
        fabric_number: nextFabricNumber,
        supplier_id: supplierFieldsPreview.supplier_id,
        supplier_name: supplierFieldsPreview.supplier_name,
      },
    ],
    lineId
  );
  if (duplicateError) {
    return { ok: false, status: 409, error: duplicateError };
  }

  const poSupplierId = fabricPoSupplierId(nextSupplierId, nextFabricNumber);
  const supplier =
    getSupplierByIdFromContacts(poSupplierId) ?? getSupplierByIdFromContacts(nextSupplierId);
  if (!supplier) {
    return { ok: false, status: 400, error: `Unknown supplier: ${nextSupplierId}` };
  }

  const fabricChanged =
    nextFabricNumber.toLowerCase() !== existing.fabric_number.toLowerCase() ||
    nextSupplierId !== existing.supplier_id;
  const garmentChanged = nextGarmentType !== existing.garment_type;

  const catalogItem = fabricChanged
    ? resolveFabricItemFromCatalog(nextSupplierId, nextFabricNumber)
    : null;
  const supplierFields = normalizeFabricSupplierFields(
    nextSupplierId,
    input.supplier_name ?? catalogItem?.supplier_name ?? existing.supplier_name ?? supplier.name,
    nextFabricNumber
  );

  const clientReference = resolveOrderClientReference(order);
  const label_stickers = garmentChanged
    ? generateFabricLabelStickers(clientReference, lineIndex + 1, nextGarmentType)
    : existing.label_stickers;
  const label_count = garmentChanged ? label_stickers.length : existing.label_count;

  const nextUnitPrice =
    options.allowPriceEdit && input.unit_price != null
      ? Number(input.unit_price)
      : fabricChanged && catalogItem?.unit_price != null && options.allowPriceEdit
        ? Number(catalogItem.unit_price)
        : existing.unit_price;

  const updatedLine: SalesOrderFabricLine = {
    ...existing,
    garment_type: nextGarmentType,
    label_count,
    label_stickers,
    supplier_id: supplierFields.supplier_id,
    supplier_name: supplierFields.supplier_name,
    fabric_number: nextFabricNumber,
    quantity: nextQuantity,
    unit: catalogItem?.unit ?? existing.unit,
    unit_price: nextUnitPrice,
    composition: fabricChanged ? (catalogItem?.composition ?? null) : existing.composition,
    weight_gsm: fabricChanged ? (catalogItem?.weight_gsm ?? null) : existing.weight_gsm,
    width_cm: fabricChanged ? (catalogItem?.width_cm ?? null) : existing.width_cm,
    width_inches: fabricChanged ? (catalogItem?.width_inches ?? null) : existing.width_inches,
    color: fabricChanged ? (catalogItem?.color ?? null) : existing.color,
    stock_status: fabricChanged ? (catalogItem?.stock_status ?? null) : existing.stock_status,
    restock_date: fabricChanged ? (catalogItem?.restock_date ?? null) : existing.restock_date,
    needs_replacement: fabricChanged
      ? catalogItem?.stock_status === "permanently_unavailable"
      : existing.needs_replacement,
    replacement_fabric_number: fabricChanged ? null : existing.replacement_fabric_number,
  };

  const nextLines = order.fabric_lines.map((line, idx) => (idx === lineIndex ? updatedLine : line));
  store.orders[index] = { ...order, fabric_lines: nextLines };

  const saved = await writeSalesOrders(store);
  const updated = saved.orders.find((item) => item.id === orderId)!;

  return { ok: true, order: updated, updated_line: updatedLine };
}

export async function deleteSalesOrderFabricLine(
  orderId: string,
  lineId: string,
  options: { removedBy?: string | null } = {}
): Promise<
  | { ok: true; order: SalesOrder; removed_line: SalesOrderFabricLine }
  | { ok: false; status: number; error: string }
> {
  await ensureDocumentsLoaded(["sales_orders"]);

  const trimmedLineId = String(lineId ?? "").trim();
  if (!trimmedLineId) {
    return { ok: false, status: 400, error: "line_id is required." };
  }

  const store = readSalesOrders();
  const index = store.orders.findIndex((order) => order.id === orderId);
  if (index < 0) {
    return { ok: false, status: 404, error: "Sales order not found." };
  }

  const order = store.orders[index]!;
  const blockedReason = fabricLineEditBlockedReason(order);
  if (blockedReason) {
    return { ok: false, status: 409, error: blockedReason };
  }

  const lineIndex = order.fabric_lines.findIndex((line) => line.id === trimmedLineId);
  if (lineIndex < 0) {
    return { ok: false, status: 404, error: "Fabric line not found on this order." };
  }

  const removedLine = order.fabric_lines[lineIndex]!;
  const nextLines = order.fabric_lines.filter((line) => line.id !== trimmedLineId);
  store.orders[index] = { ...order, fabric_lines: nextLines };

  const saved = await writeSalesOrders(store);
  const updated = saved.orders.find((item) => item.id === orderId)!;

  return { ok: true, order: updated, removed_line: removedLine };
}
