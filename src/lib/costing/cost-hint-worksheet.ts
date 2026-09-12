import { getBrandClientCodePrefix } from "@/lib/clients/codes";
import {
  COST_HINT_NAMED_CLIENTS,
  matchesCostHintClientFilter,
  resolveCostHintNamedClient,
} from "@/lib/costing/cost-hint-clients";
import type { CostingOverview, FabricLineCost, SalesOrderCost } from "@/lib/costing/compute";
import { getSupplierPriceCurrency, toSar } from "@/lib/currency/config";
import { resolveFabricSwatchUrls } from "@/lib/fabric-sourcing/fabric-swatch-keys";
import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import { formatInvoiceFibreContent } from "@/lib/invoicing/display";
import { buildDownloadFilename } from "@/lib/pdf/download-filename";
import { getLabelCountForGarment, GARMENT_STITCH_TYPES } from "@/lib/sales-orders/garment-types";
import {
  getGarmentPieces,
  lineArticleFromStickerCode,
  pieceNamesFromInvoicePieceField,
  soArticleFromFabricLine,
} from "@/lib/sales-orders/label-codes";
import type { CustomerInvoice, CustomerInvoiceLine } from "@/lib/types/customer-invoices";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

const MILL_LABEL_TO_SUPPLIER_ID: Record<string, string> = {
  caccioppoli: "caccioppoli",
  cacci: "caccioppoli",
  drapers: "drapers",
  dp: "drapers",
  "loro piana": "loro-piana",
  lp: "loro-piana",
  solbiati: "solbiati",
  solb: "solbiati",
  zegna: "zegna",
  ze: "zegna",
  "ermenegildo zegna": "zegna",
  canclini: "canclini",
  cc: "canclini",
  stylbiella: "stylbiella",
  sb: "stylbiella",
};

function millLookupKey(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function supplierIdFromMillLabel(label: string | null | undefined): string | null {
  if (!label?.trim()) return null;
  return MILL_LABEL_TO_SUPPLIER_ID[millLookupKey(label)] ?? null;
}

function firstToken(value: string | null | undefined): string {
  return value?.trim().split(/\s+/)[0] ?? "";
}

function preferFibreComposition(...candidates: Array<string | null | undefined>): string | null {
  const values = candidates.map((value) => value?.trim() || "").filter(Boolean);
  const withFibre = values.find((value) => Boolean(formatInvoiceFibreContent(value)));
  if (withFibre) return withFibre;
  const notMillOnly = values.find(
    (value) => !supplierIdFromMillLabel(value) && !supplierIdFromMillLabel(firstToken(value))
  );
  return notMillOnly ?? values[0] ?? null;
}

function fillFabricDetails(input: {
  supplier_id: string | null;
  fabric_number: string;
  fabric_brand: string | null;
  composition: string | null;
  weight_gsm: number | null;
  color: string | null;
}): {
  supplier_id: string | null;
  fabric_brand: string | null;
  composition: string | null;
  weight_gsm: number | null;
  color: string | null;
} {
  const supplierId =
    input.supplier_id ||
    supplierIdFromMillLabel(input.fabric_brand) ||
    supplierIdFromMillLabel(firstToken(input.composition));
  const fabricBrand =
    input.fabric_brand?.trim() ||
    (supplierId ? formatFabricSupplierName(supplierId, supplierId, input.fabric_number) : null);
  const composition = preferFibreComposition(input.composition);
  const weightGsm = input.weight_gsm;
  const color = input.color?.trim() || null;

  return {
    supplier_id: supplierId,
    fabric_brand: fabricBrand,
    composition,
    weight_gsm: weightGsm,
    color,
  };
}

export type CostHintWorksheetRow = {
  so_number: string;
  invoice_number: string | null;
  client_name: string;
  client_code: string;
  article_label: string;
  garment: string;
  fabric_number: string;
  fabric_brand: string | null;
  supplier_id: string | null;
  composition: string | null;
  weight_gsm: number | null;
  color: string | null;
  quantity: number;
  /** Mill price for one meter of cloth, converted to SAR. */
  price_per_meter_sar: number | null;
  /** Meters behind the fabric cost on this row - per garment, so the two reconcile. */
  meters_per_piece: number | null;
  fabric_cost_sar: number | null;
  cost_hint_sar: number | null;
  unit_price_sar: number | null;
  missing_price: boolean;
  article_count: number;
  piece_names?: string[];
};

export type CostHintArticleSummaryItem = {
  label: string;
  count: number;
};

export type CostHintArticleSummary = {
  items: CostHintArticleSummaryItem[];
  total_pcs: number;
};

export type CostHintWorksheet = {
  title: string;
  subtitle: string;
  generated_at: string;
  rows: CostHintWorksheetRow[];
  missing_price_count: number;
  article_summary?: string;
  /**
   * What the length column counts. The sitewide sheet reports one piece of a
   * garment; the per-invoice sheet reports a whole billed article, because that
   * is the unit its fabric cost is stated in.
   */
  meters_column_header?: string;
};

export function articleLabelFromNumber(articleNumber: number): string {
  return `L${String(articleNumber).padStart(2, "0")}`;
}

export function pieceCountForFabricLine(line: Pick<SalesOrderFabricLine, "label_count" | "label_stickers">): number {
  return Math.max(line.label_stickers?.length ?? line.label_count ?? 1, 1);
}

export type CostHintFabricBasis = {
  price_per_meter_sar: number | null;
  meters_per_piece: number | null;
};

/** Units that measure cloth by length. Anything else has no meaningful price per meter. */
const METER_UNITS = new Set(["meters", "meter", "m", "cutlength"]);

/**
 * The cloth price and the meters behind one garment's fabric cost.
 *
 * Meters are divided by the piece count because `fabric_cost_sar` on a row is
 * per piece. Quoting the whole line's meters next to a per-piece cost would not
 * multiply out.
 */
export function costHintFabricBasis(input: {
  unit_price: number | null | undefined;
  supplier_id: string | null | undefined;
  meters: number | null | undefined;
  unit?: string | null;
  pieces: number;
}): CostHintFabricBasis {
  const pieces = Math.max(input.pieces, 1);
  const unit = input.unit?.trim().toLowerCase();
  if (unit && !METER_UNITS.has(unit)) {
    return { price_per_meter_sar: null, meters_per_piece: null };
  }

  const meters =
    input.meters != null && Number.isFinite(input.meters) && input.meters > 0
      ? input.meters / pieces
      : null;

  const price =
    input.unit_price != null && Number.isFinite(input.unit_price) && input.unit_price > 0
      ? Math.round(toSar(input.unit_price, getSupplierPriceCurrency(input.supplier_id ?? "")) * 100) / 100
      : null;

  return { price_per_meter_sar: price, meters_per_piece: meters };
}

export function formatCostHintMeters(meters: number | null): string {
  if (meters == null || !Number.isFinite(meters)) return "-";
  return `${Math.round(meters * 100) / 100} m`;
}

export function unitCostFromLineTotal(total: number | null | undefined, pieces: number): number | null {
  if (total == null || !Number.isFinite(total)) return null;
  return Math.round((total / Math.max(pieces, 1)) * 100) / 100;
}

export function formatCostHintComposition(composition: string | null | undefined): string {
  const raw = composition?.trim() ?? "";
  if (!raw) return "-";
  const fibre = formatInvoiceFibreContent(raw);
  if (fibre) return fibre;
  if (supplierIdFromMillLabel(raw) || supplierIdFromMillLabel(firstToken(raw))) return "-";
  return raw;
}

export function formatCostHintWeight(weightGsm: number | null | undefined): string {
  if (weightGsm == null || !Number.isFinite(weightGsm)) return "-";
  return `${Math.round(weightGsm)} gsm`;
}

/** First mill code on a combined fabric cell - used for the mini swatch. */
export function costHintPrimaryFabricNumber(fabricNumber: string | null | undefined): string {
  const first = fabricNumber?.split(",")[0]?.trim() ?? "";
  return first;
}

function costHintFibreKey(composition: string | null | undefined): string | null {
  const fibre = formatCostHintComposition(composition);
  if (!fibre || fibre === "-") return null;
  return fibre.toLowerCase();
}

function costHintWeightKey(weightGsm: number | null | undefined): string | null {
  if (weightGsm == null || !Number.isFinite(weightGsm)) return null;
  return String(Math.round(weightGsm));
}

/**
 * Mill identity uses the supplier id *and* the printed brand. One supplier id
 * can print under two names - a fabric number starting with "S" shows as
 * Solbiati - and a merged row can only carry one brand.
 */
function costHintMillKey(
  row: Partial<Pick<CostHintWorksheetRow, "supplier_id" | "fabric_brand">>
): string {
  const supplier = row.supplier_id?.trim().toLowerCase() ?? "";
  const brand = row.fabric_brand?.trim().toLowerCase() ?? "";
  return `${supplier}/${brand}`;
}

/** Money must match exactly to merge - an absent figure is its own bucket. */
function costHintMoneyKey(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "-" : String(Math.round(value * 100));
}

/** Meters to the millimetre - two different cut lengths are two different rows. */
function costHintMetersKey(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "-" : String(Math.round(value * 1000));
}

/**
 * Same sales order + garment + fibre + gsm + mill + money. Missing fibre or
 * weight stays on its own row so unknown fabrics are not mashed together.
 *
 * Mill and money are part of the key because a merged row can only print one
 * of each: without them a Zegna line and a Solbiati line collapse into one
 * article, and differing costs are discarded rather than shown.
 */
export function costHintInvoiceGroupKey(
  row: Pick<CostHintWorksheetRow, "so_number" | "garment" | "composition" | "weight_gsm"> &
    Partial<
      Pick<
        CostHintWorksheetRow,
        | "supplier_id"
        | "fabric_brand"
        | "fabric_cost_sar"
        | "cost_hint_sar"
        | "unit_price_sar"
        | "price_per_meter_sar"
        | "meters_per_piece"
      >
    >
): string | null {
  const fibre = costHintFibreKey(row.composition);
  const weight = costHintWeightKey(row.weight_gsm);
  const garment = row.garment.trim().toLowerCase();
  const so = row.so_number.trim();
  if (!so || !garment || !fibre || !weight) return null;
  const money = [row.fabric_cost_sar, row.cost_hint_sar, row.unit_price_sar]
    .map(costHintMoneyKey)
    .join("/");
  const basis = [costHintMoneyKey(row.price_per_meter_sar), costHintMetersKey(row.meters_per_piece)].join("/");
  return `${so}|${garment}|${fibre}|${weight}|${costHintMillKey(row)}|${money}|${basis}`;
}

function uniqueJoined(values: Array<string | null | undefined>): string | null {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    ordered.push(trimmed);
  }
  if (ordered.length === 0) return null;
  return ordered.join(", ");
}

function sameNumber(values: Array<number | null | undefined>): number | null {
  const present = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (present.length === 0 || present.length !== values.length) return null;
  const first = present[0]!;
  return present.every((value) => value === first) ? first : null;
}

function mergeCostHintGroup(group: CostHintWorksheetRow[]): CostHintWorksheetRow {
  const first = group[0]!;
  if (group.length === 1) return first;
  const fabricNumbers = uniqueJoined(group.map((row) => row.fabric_number));
  const brandSet = [
    ...new Set(group.map((row) => row.fabric_brand?.trim()).filter((value): value is string => Boolean(value))),
  ];
  const supplierIds = [
    ...new Set(group.map((row) => row.supplier_id?.trim()).filter((value): value is string => Boolean(value))),
  ];
  const colorSet = [
    ...new Set(group.map((row) => row.color?.trim()).filter((value): value is string => Boolean(value))),
  ];
  const invoiceSet = [
    ...new Set(group.map((row) => row.invoice_number?.trim()).filter((value): value is string => Boolean(value))),
  ];
  const articleLabels = group.map((row) => row.article_label.trim()).filter(Boolean);
  const articleLabel =
    articleLabels.length <= 1
      ? first.article_label
      : `${articleLabels[0]} x${articleLabels.length}`;
  const missingPrice = group.some((row) => row.missing_price);
  const pieceNames = [
    ...new Set(group.flatMap((row) => row.piece_names ?? []).map((name) => name.trim()).filter(Boolean)),
  ];
  return {
    ...first,
    article_label: articleLabel,
    fabric_number: fabricNumbers ?? first.fabric_number,
    fabric_brand: brandSet.length === 1 ? brandSet[0]! : brandSet.length > 1 ? brandSet.join(", ") : first.fabric_brand,
    supplier_id: supplierIds.length === 1 ? supplierIds[0]! : first.supplier_id,
    color: colorSet.length === 1 ? colorSet[0]! : null,
    invoice_number: invoiceSet.length === 1 ? invoiceSet[0]! : first.invoice_number,
    quantity: group.reduce((sum, row) => sum + row.quantity, 0),
    article_count: group.reduce((sum, row) => sum + row.article_count, 0),
    price_per_meter_sar: sameNumber(group.map((row) => row.price_per_meter_sar)),
    meters_per_piece: sameNumber(group.map((row) => row.meters_per_piece)),
    fabric_cost_sar: sameNumber(group.map((row) => row.fabric_cost_sar)),
    cost_hint_sar: sameNumber(group.map((row) => row.cost_hint_sar)),
    unit_price_sar: sameNumber(group.map((row) => row.unit_price_sar)),
    missing_price: missingPrice,
    piece_names: pieceNames,
  };
}

/** Collapse same garment + fibre + gsm + mill + money on one sales order into one row. */
export function combineCostHintRowsByGarmentFibreWeight(
  rows: CostHintWorksheetRow[]
): CostHintWorksheetRow[] {
  const buckets = new Map<string, CostHintWorksheetRow[]>();
  const firstIndex = new Map<string, number>();
  const passthrough: Array<{ index: number; row: CostHintWorksheetRow }> = [];

  rows.forEach((row, index) => {
    const key = costHintInvoiceGroupKey(row);
    if (!key) {
      passthrough.push({ index, row });
      return;
    }
    const bucket = buckets.get(key) ?? [];
    if (bucket.length === 0) firstIndex.set(key, index);
    bucket.push(row);
    buckets.set(key, bucket);
  });

  const merged = [...buckets.entries()].map(([key, bucket]) => ({
    index: firstIndex.get(key) ?? 0,
    row: mergeCostHintGroup(bucket),
  }));

  return [...merged, ...passthrough]
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.row);
}

export function costHintSwatchUrl(
  supplierId: string | null | undefined,
  fabricNumber: string | null | undefined
): string | null {
  if (!supplierId?.trim() || !fabricNumber?.trim()) return null;
  return (
    resolveFabricSwatchUrls(supplierId, fabricNumber, new Map(), new Map(), new Map())?.square ?? null
  );
}

export function costHintGarmentFamily(garment: string | null | undefined): string {
  const text = garment?.trim().replace(/\s+/g, " ") ?? "";
  if (!text) return "Other";
  const lower = text.toLowerCase();
  if (lower.includes("suit+vest") || lower.startsWith("suit + vest")) return "Suit+Vest";
  if (lower.startsWith("overshirt+trouser") || lower.startsWith("overshirt + trouser")) {
    return "Overshirt+Trouser";
  }
  if (lower.startsWith("shirt+trouser+short") || lower.startsWith("shirt + trouser + short")) {
    return "Shirt+Trouser+Short";
  }
  if (lower.startsWith("shirt+trouser") || lower.startsWith("shirt + trouser")) return "Shirt+Trouser";
  if (lower.startsWith("shirt+short") || lower.startsWith("shirt + short")) return "Shirt+Short";
  if (lower.startsWith("overshirt")) return "Overshirt";
  if (
    lower === "suit" ||
    lower.startsWith("suit (") ||
    (/\bjacket\b/.test(lower) && /\btrouser\b/.test(lower) && !/\bshirt\b/.test(lower))
  ) {
    return "Suit";
  }
  if (lower.startsWith("shirt")) return "Shirt";
  if (lower.startsWith("t-shirt") || lower.startsWith("tshirt")) return "T-shirt";
  return text.split(" (")[0]?.trim() || "Other";
}

export function articleCountForCostLine(input: {
  garmentType: string;
  pieces: number;
  invoicedQuantity?: number | null;
}): number {
  if (input.invoicedQuantity != null && Number.isFinite(input.invoicedQuantity)) {
    return Math.max(0, input.invoicedQuantity);
  }
  const labelsPerArticle = Math.max(getLabelCountForGarment(input.garmentType), 1);
  return Math.max(1, Math.round(input.pieces / labelsPerArticle));
}

function pluralizeCostHintGarment(label: string, count: number): string {
  if (count === 1) return label;
  if (label.includes("+")) return label;
  if (label === "Trouser") return "Trousers";
  if (label.endsWith("s")) return label;
  return `${label}s`;
}

function garmentFamilySortIndex(label: string): number {
  const preferred = ["Shirt", "Overshirt", "Suit", "Jacket", "Trouser", "Short", "Vest"];
  const preferredIndex = preferred.indexOf(label);
  if (preferredIndex >= 0) return preferredIndex;
  const typeIndex = (GARMENT_STITCH_TYPES as readonly string[]).indexOf(label);
  return typeIndex >= 0 ? 100 + typeIndex : 1000;
}

/** Every combo set expands to pieces: Shirt+Trouser+Short, Suit, Overshirt+Trouser, ... */
export function costHintResumePieces(
  garment: string | null | undefined,
  extraPieceNames?: string[] | null
): string[] {
  const family = costHintGarmentFamily(garment);
  const fromFamily = getGarmentPieces(family);
  if (fromFamily.length > 1) return fromFamily.map((piece) => costHintGarmentFamily(piece));

  const rawType = garment?.trim().split(" (")[0]?.trim() ?? "";
  const fromRaw = rawType ? getGarmentPieces(rawType) : [];
  if (fromRaw.length > 1) return fromRaw.map((piece) => costHintGarmentFamily(piece));

  const extras = (extraPieceNames ?? []).map((name) => name.trim()).filter(Boolean);
  if (extras.length > 1) return extras.map((piece) => costHintGarmentFamily(piece));

  if (garment && / \+ /.test(garment)) {
    const fromJoined = garment
      .replace(/^[^(]*\(/, "")
      .replace(/\)\s*$/, "")
      .split(" + ")
      .map((piece) => costHintGarmentFamily(piece))
      .filter((piece) => piece && piece !== "Other");
    if (fromJoined.length > 1) return fromJoined;
  }

  return [family];
}

export function summarizeCostHintArticles(rows: Array<Pick<CostHintWorksheetRow, "garment" | "article_count" | "piece_names">>): CostHintArticleSummary {
  const counts = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    const count = Number.isFinite(row.article_count) ? Math.max(0, row.article_count) : 1;
    if (count === 0) continue;
    for (const label of costHintResumePieces(row.garment, row.piece_names)) {
      counts.set(label, (counts.get(label) ?? 0) + count);
      total += count;
    }
  }
  const items = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort(
      (a, b) =>
        garmentFamilySortIndex(a.label) - garmentFamilySortIndex(b.label) ||
        a.label.localeCompare(b.label)
    );
  return { items, total_pcs: total };
}

export function formatCostHintArticleSummary(summary: CostHintArticleSummary): string {
  const parts = summary.items.map(
    (item) => `${item.count} ${pluralizeCostHintGarment(item.label, item.count)}`
  );
  const sameCount =
    summary.items.length > 1 && summary.items.every((item) => item.count === summary.items[0]?.count);
  const each = sameCount ? `${summary.items[0]!.count} of each. ` : "";
  const total = `Total: ${summary.total_pcs} pcs`;
  return parts.length > 0 ? `${parts.join(", ")}. ${each}${total}` : total;
}

function attachArticleSummary<T extends { rows: CostHintWorksheetRow[] }>(
  worksheet: T
): T & { article_summary: string } {
  return {
    ...worksheet,
    article_summary: formatCostHintArticleSummary(summarizeCostHintArticles(worksheet.rows)),
  };
}

/** A combined invoice puts every covered order in one cell, comma separated. */
export function costHintSoNumbersInCell(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function costHintRowCoversSoNumber(
  row: { so_number?: string | null },
  soNumber: string
): boolean {
  return costHintSoNumbersInCell(row.so_number).includes(soNumber.trim());
}

export function uniqueCostHintSoNumbers(rows: Array<{ so_number?: string | null }>): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const so of costHintSoNumbersInCell(row.so_number)) seen.add(so);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/**
 * Columns that never change down the sheet. On a combined invoice the order
 * list, invoice number and client repeat on every row and eat the width the
 * fabric columns need, so the view prints them once in the header instead.
 */
export function costHintConstantColumns(rows: CostHintWorksheetRow[]): {
  so_numbers: string[] | null;
  invoice_number: string | null;
  client_name: string | null;
} {
  if (rows.length === 0) {
    return { so_numbers: null, invoice_number: null, client_name: null };
  }
  const constant = <T>(pick: (row: CostHintWorksheetRow) => T): T | null => {
    const first = pick(rows[0]!);
    return rows.every((row) => pick(row) === first) ? first : null;
  };
  const soCell = constant((row) => row.so_number?.trim() ?? "");
  const invoice = constant((row) => row.invoice_number?.trim() ?? "");
  const client = constant((row) => row.client_name?.trim() ?? "");
  return {
    so_numbers: soCell ? costHintSoNumbersInCell(soCell) : null,
    invoice_number: invoice || null,
    client_name: client || null,
  };
}

export function formatCostHintSalesOrderScope(rows: Array<{ so_number?: string | null }>): string {
  const sos = uniqueCostHintSoNumbers(rows);
  if (sos.length === 0) return "no sales orders";
  if (sos.length === 1) return sos[0];
  return `${sos.length} sales orders | ${sos.join(" | ")}`;
}

export function namedCostHintClientLabelForRows(
  rows: Array<{ client_name: string; client_code: string }>
): string | null {
  if (rows.length === 0) return null;
  const hits = COST_HINT_NAMED_CLIENTS.filter((client) =>
    rows.every((row) => matchesCostHintClientFilter(row.client_name, row.client_code, [client.key]))
  );
  return hits.length === 1 ? hits[0].label : null;
}

function namedClientHeading(
  label: string,
  rows: Array<{ so_number?: string | null }>
): { title: string; subtitle: string } {
  const sos = uniqueCostHintSoNumbers(rows);
  const scope = formatCostHintSalesOrderScope(rows);
  const title =
    sos.length > 1
      ? `Cost hint worksheet - ${label} - ${sos.length} sales orders`
      : `Cost hint worksheet - ${label} - ${sos[0] ?? "no sales orders"}`;
  return {
    title,
    subtitle: `Internal. Do not send to the client. ${label}. ${scope}. SAR/m x meters/pc + 5% duty = fabric cost. Cost hint = fabric cost + make, per piece. VAT excluded.`,
  };
}

export function applyCostHintNamedClientCopy(
  worksheet: CostHintWorksheet,
  label: string
): CostHintWorksheet {
  const copy = namedClientHeading(label, worksheet.rows);
  return attachArticleSummary({
    ...worksheet,
    title: copy.title,
    subtitle: copy.subtitle,
    missing_price_count: worksheet.rows.filter((row) => row.missing_price).length,
  });
}

export function formatCostHintMissingMillSummary(
  rows: Array<{ fabric_brand?: string | null }>
): string {
  const mills = new Map<string, number>();
  for (const row of rows) {
    const mill = row.fabric_brand?.trim() || "Unknown mill";
    mills.set(mill, (mills.get(mill) ?? 0) + 1);
  }
  return [...mills.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => `${count} ${name}`)
    .join(", ");
}

export function costHintMissingPriceFilename(label: string, count: number): string {
  return buildDownloadFilename(["cost-hints", label, `${count}-missing-fabric-price`]);
}

export function applyCostHintMissingPriceCopy(
  worksheet: CostHintWorksheet,
  label: string
): CostHintWorksheet {
  const rows = worksheet.rows.filter((row) => row.missing_price);
  const scope = formatCostHintSalesOrderScope(rows);
  const mills = formatCostHintMissingMillSummary(rows);
  const lineLabel =
    rows.length === 1 ? "1 line missing fabric price" : `${rows.length} lines missing fabric price`;
  const next = attachArticleSummary({
    ...worksheet,
    title: `Cost hint worksheet - ${label} - ${lineLabel}`,
    subtitle: `Internal. Do not send to the client. ${label}. ${lineLabel} with no mill catalog price and no sales-order price. ${scope}. Mills: ${mills || "none"}.`,
    rows,
    missing_price_count: rows.length,
  });
  return {
    ...next,
    article_summary: mills
      ? `${next.article_summary} Mills: ${mills}.`
      : next.article_summary,
  };
}

export function worksheetForCostHintDownload(
  worksheet: CostHintWorksheet,
  options?: { missingPrices?: boolean }
): CostHintWorksheet | null {
  if (!options?.missingPrices) return worksheet;
  const label =
    namedCostHintClientLabelForRows(worksheet.rows) ??
    worksheet.rows[0]?.client_name ??
    "cost hints";
  const missing = applyCostHintMissingPriceCopy(worksheet, label);
  return missing.rows.length > 0 ? missing : null;
}

export function costHintDownloadFilename(worksheet: CostHintWorksheet): string {
  if (worksheet.title.includes("missing fabric price")) {
    const label =
      namedCostHintClientLabelForRows(worksheet.rows) ??
      worksheet.rows[0]?.client_name ??
      "cost-hints";
    return costHintMissingPriceFilename(label, worksheet.rows.length);
  }
  return costHintWorksheetFilename(worksheet);
}

export function costHintNamedClientPackFiles(
  worksheet: CostHintWorksheet,
  label: string
): Array<{ name: string; worksheet: CostHintWorksheet }> {
  const combined = applyCostHintNamedClientCopy(worksheet, label);
  const files = [{ name: costHintWorksheetFilename(combined), worksheet: combined }];
  const missingSheet = applyCostHintMissingPriceCopy(worksheet, label);
  if (missingSheet.rows.length > 0) {
    files.push({
      name: costHintMissingPriceFilename(label, missingSheet.rows.length),
      worksheet: missingSheet,
    });
  }
  const sos = uniqueCostHintSoNumbers(worksheet.rows);
  if (sos.length < 2) return files;
  for (const soNumber of sos) {
    const rows = worksheet.rows.filter((row) => costHintRowCoversSoNumber(row, soNumber));
    if (rows.length === 0) continue;
    const slice = applyCostHintNamedClientCopy({ ...combined, rows }, label);
    files.push({ name: costHintWorksheetFilename(slice), worksheet: slice });
  }
  return files;
}

function formatArticleFromInvoice(articleNumber: number | null | undefined, fallback: string): string {
  if (articleNumber == null || !Number.isFinite(articleNumber)) return fallback;
  return articleLabelFromNumber(articleNumber);
}

function matchesBrand(clientCode: string, brandId: string | null | undefined): boolean {
  if (!brandId) return true;
  const prefix = getBrandClientCodePrefix(brandId);
  if (!prefix) return true;
  return clientCode.startsWith(`${prefix}-`) || clientCode === prefix;
}

export type CostHintSellingPrice = {
  invoice_number: string;
  unit_price_sar: number;
  quantity: number;
};

/**
 * Same sales order, garment, fibre and weight.
 *
 * This is the rule the invoice merged its own lines with, minus the mill. The
 * mill has to go: a sales order records every Solbiati cloth under the
 * `loro-piana` supplier id while the invoice prints "Solbiati" beside it, so
 * including it would fail on precisely the consolidated lines this exists to
 * match. Garment, fibre and weight inside one order is a tight enough key, and
 * nothing is claimed beyond the quantity the invoice actually billed.
 */
function consolidatedSellingKey(input: {
  garment_type: string;
  composition?: string | null;
  weight_gsm?: number | null;
}): string | null {
  const garment = input.garment_type?.trim().toLowerCase();
  const fibre = costHintFibreKey(input.composition);
  const weight = costHintWeightKey(input.weight_gsm);
  if (!garment || !fibre || !weight) return null;
  return `${garment}|${fibre}|${weight}`;
}

/**
 * Give a consolidated invoice line's price to every cut it bills.
 *
 * When several cuts merge into one invoice article - six trousers of one fibre
 * and weight billed as a single row - only the first keeps a
 * `sales_order_line_id`. The rest printed a blank selling price beside a real
 * cost, as if they had never been charged for, while the one matched row claimed
 * the whole invoiced quantity and its siblings still counted themselves, so the
 * sheet showed eleven trousers where six were cut.
 *
 * The quantity is moved, not invented: whatever is handed to the siblings is
 * taken off the matched row, so the six stay six. Cuts the invoice has no
 * quantity left for keep their blank, which is how a garment that was made and
 * never billed stays visible.
 */
export function spreadConsolidatedSellingPrices(
  invoices: CustomerInvoice[],
  orders: SalesOrderCost[],
  selling: Map<string, CostHintSellingPrice>
): void {
  const orderBySoNumber = new Map(orders.map((order) => [order.so_number, order]));

  for (const invoice of invoices) {
    const order = orderBySoNumber.get(invoice.so_number ?? "");
    if (!order) continue;

    for (const line of invoice.lines ?? []) {
      const billed = Math.round(line.quantity);
      if (!Number.isFinite(billed) || billed <= 1) continue;
      const key = consolidatedSellingKey(line);
      if (!key) continue;

      const unclaimed = order.lines.filter(
        (cost) => !selling.has(cost.line_id) && consolidatedSellingKey(cost) === key
      );
      const claimed = unclaimed.slice(0, billed - 1);
      if (claimed.length === 0) continue;

      for (const cost of claimed) {
        selling.set(cost.line_id, {
          invoice_number: invoice.invoice_number,
          unit_price_sar: line.unit_price,
          quantity: 1,
        });
      }

      const matched = line.sales_order_line_id ? selling.get(line.sales_order_line_id) : undefined;
      if (matched && matched.invoice_number === invoice.invoice_number) {
        matched.quantity = billed - claimed.length;
      }
    }
  }
}

export function sellingPriceByFabricLineId(
  invoices: CustomerInvoice[]
): Map<string, CostHintSellingPrice> {
  const map = new Map<string, CostHintSellingPrice>();
  const newestFirst = [...invoices].sort((a, b) =>
    (b.invoice_date || "").localeCompare(a.invoice_date || "")
  );
  for (const invoice of newestFirst) {
    for (const line of invoice.lines ?? []) {
      if (!line.sales_order_line_id || map.has(line.sales_order_line_id)) continue;
      map.set(line.sales_order_line_id, {
        invoice_number: invoice.invoice_number,
        unit_price_sar: line.unit_price,
        quantity: line.quantity,
      });
    }
  }
  return map;
}

function rowFromCostLine(input: {
  order: SalesOrderCost;
  line: FabricLineCost;
  fabricLine: SalesOrderFabricLine | undefined;
  selling: { invoice_number: string; unit_price_sar: number; quantity: number } | undefined;
}): CostHintWorksheetRow {
  const pieces = input.fabricLine ? pieceCountForFabricLine(input.fabricLine) : 1;
  const fabricCost = unitCostFromLineTotal(input.line.fabric_cost_sar, pieces);
  const costHint = unitCostFromLineTotal(input.line.total_cost_sar, pieces);
  const basis = costHintFabricBasis({
    unit_price: input.line.unit_price,
    supplier_id: input.line.supplier_id,
    meters: input.line.meters,
    unit: input.line.unit,
    pieces,
  });
  const articleCount = articleCountForCostLine({
    garmentType: input.line.garment_type,
    pieces,
    invoicedQuantity: input.selling?.quantity,
  });
  const details = fillFabricDetails({
    supplier_id: input.line.supplier_id || input.fabricLine?.supplier_id || null,
    fabric_number: input.line.fabric_number,
    fabric_brand:
      formatFabricSupplierName(
        input.line.supplier_id,
        input.line.supplier_name,
        input.line.fabric_number
      ) || null,
    composition: preferFibreComposition(input.line.composition, input.fabricLine?.composition),
    weight_gsm: input.line.weight_gsm ?? input.fabricLine?.weight_gsm ?? null,
    color: input.line.color ?? input.fabricLine?.color ?? null,
  });
  return {
    so_number: input.order.so_number,
    invoice_number: input.selling?.invoice_number ?? null,
    client_name: input.order.client_name,
    client_code: input.order.client_code,
    article_label: articleLabelFromNumber(input.line.article_number),
    garment: input.line.garment_type,
    fabric_number: input.line.fabric_number,
    fabric_brand: details.fabric_brand,
    supplier_id: details.supplier_id,
    composition: details.composition,
    weight_gsm: details.weight_gsm,
    color: details.color,
    quantity: input.selling?.quantity ?? pieces,
    price_per_meter_sar: basis.price_per_meter_sar,
    meters_per_piece: basis.meters_per_piece,
    fabric_cost_sar: fabricCost,
    cost_hint_sar: costHint,
    unit_price_sar: input.selling?.unit_price_sar ?? null,
    missing_price: !input.line.has_fabric_price,
    article_count: articleCount,
    piece_names: input.fabricLine
      ? (input.fabricLine.label_stickers ?? []).map((sticker) => sticker.piece_name).filter(Boolean)
      : [],
  };
}

export function buildCostHintWorksheet(options: {
  overview: CostingOverview;
  salesOrders: SalesOrder[];
  invoices?: CustomerInvoice[];
  brandId?: string | null;
  soNumber?: string | null;
  includeArchived?: boolean;
  clientTokens?: string[];
  generatedAt?: string;
}): CostHintWorksheet {
  const soById = new Map(options.salesOrders.map((order) => [order.id, order]));
  const selling = sellingPriceByFabricLineId(options.invoices ?? []);
  spreadConsolidatedSellingPrices(options.invoices ?? [], options.overview.orders, selling);
  const soFilter = options.soNumber?.trim().toUpperCase() ?? "";
  const clientTokens = options.clientTokens ?? [];
  const namedClients = clientTokens.length > 0;
  const rows: CostHintWorksheetRow[] = [];

  for (const order of options.overview.orders) {
    if (!namedClients && !options.includeArchived && order.is_archived) continue;
    if (!namedClients && !matchesBrand(order.client_code, options.brandId)) continue;
    if (soFilter && order.so_number.toUpperCase() !== soFilter) continue;
    if (!matchesCostHintClientFilter(order.client_name, order.client_code, clientTokens)) continue;
    const salesOrder = soById.get(order.order_id);
    const fabricById = new Map((salesOrder?.fabric_lines ?? []).map((line) => [line.id, line]));
    for (const line of order.lines) {
      rows.push(
        rowFromCostLine({
          order,
          line,
          fabricLine: fabricById.get(line.line_id),
          selling: selling.get(line.line_id),
        })
      );
    }
  }

  const namedLabel =
    namedCostHintClientLabelForRows(rows) ??
    (clientTokens.length === 1 ? resolveCostHintNamedClient(clientTokens[0])?.label ?? null : null);
  const scope = soFilter
    ? soFilter
    : namedLabel
      ? formatCostHintSalesOrderScope(rows)
      : clientTokens.length > 0
        ? clientTokens.join(", ")
        : options.brandId
          ? `${options.brandId} brand`
          : "all orders";
  const namedCopy = namedLabel ? namedClientHeading(namedLabel, rows) : null;
  const combinedRows = combineCostHintRowsByGarmentFibreWeight(rows);

  return attachArticleSummary({
    title: namedCopy?.title ?? "Cost hint worksheet",
    subtitle:
      namedCopy?.subtitle ??
      `Internal. Do not send to the client. ${scope}. SAR/m x meters/pc + 5% duty = fabric cost. Cost hint = fabric cost + make, per piece. VAT excluded.`,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    rows: combinedRows,
    missing_price_count: combinedRows.filter((row) => row.missing_price).length,
  });
}

/**
 * The order line a cost hint row is priced from.
 *
 * Not every invoice line carries `sales_order_line_id`: older lines were matched
 * by the sticker printed on the cut and never had the id written back. Those
 * rows still have a real fabric line behind them, and without it the sheet loses
 * both the mill price and the length.
 *
 * The basis columns have to multiply out to the row's own fabric cost, so this
 * only accepts a line identified beyond doubt - the stored link, the sticker, or
 * the article that sticker names - and takes a fabric number only when a single
 * line carries it. It stops short of matching on garment type: every Trouser
 * line would satisfy that, and quoting one cloth's price beside another cloth's
 * cost is worse than leaving the cell blank.
 */
function findCostHintFabricLine(
  invoiceLine: CustomerInvoiceLine,
  orders: SalesOrder[],
  fabricById: Map<string, SalesOrderFabricLine>
): SalesOrderFabricLine | undefined {
  if (invoiceLine.sales_order_line_id) {
    const byId = fabricById.get(invoiceLine.sales_order_line_id);
    if (byId) return byId;
  }

  const allLines = orders.flatMap((order) => order.fabric_lines ?? []);

  if (invoiceLine.sticker_code) {
    const bySticker = allLines.find((line) =>
      line.label_stickers?.some((sticker) => sticker.code === invoiceLine.sticker_code)
    );
    if (bySticker) return bySticker;

    const article = lineArticleFromStickerCode(invoiceLine.sticker_code);
    if (article != null) {
      const byArticle = allLines.filter((line) => soArticleFromFabricLine(line) === article);
      if (byArticle.length === 1) return byArticle[0];
    }
  }

  if (invoiceLine.fabric_number) {
    const byFabric = allLines.filter((line) => line.fabric_number === invoiceLine.fabric_number);
    if (byFabric.length === 1) return byFabric[0];
  }

  return undefined;
}

export function buildCostHintWorksheetFromInvoice(options: {
  invoice: CustomerInvoice;
  /** Every order the invoice covers - a combined invoice spans several. */
  salesOrders?: SalesOrder[];
  salesOrder?: SalesOrder | null;
  /**
   * Cloth price and meters per fabric line id. Most fabric lines store
   * `unit_price: 0` and carry the real price only in the supplier catalog, which
   * this module cannot read, so the caller resolves it.
   */
  fabricBasisByLineId?: Map<string, CostHintFabricBasis>;
  generatedAt?: string;
}): CostHintWorksheet {
  const coveredOrders = [
    ...(options.salesOrders ?? []),
    ...(options.salesOrder ? [options.salesOrder] : []),
  ];
  const fabricById = new Map(
    coveredOrders.flatMap((order) =>
      (order.fabric_lines ?? []).map((line) => [line.id, line] as const)
    )
  );
  const rows: CostHintWorksheetRow[] = (options.invoice.lines ?? []).map((line, index) => {
    const fabricLine = findCostHintFabricLine(line, coveredOrders, fabricById);
    const fabricNumber = line.fabric_number ?? fabricLine?.fabric_number ?? "";
    const details = fillFabricDetails({
      supplier_id: fabricLine?.supplier_id ?? null,
      fabric_number: fabricNumber,
      fabric_brand:
        line.fabric_brand?.trim() ||
        (fabricLine
          ? formatFabricSupplierName(fabricLine.supplier_id, fabricLine.supplier_name, fabricLine.fabric_number)
          : null),
      composition: preferFibreComposition(fabricLine?.composition, line.composition),
      weight_gsm: line.weight_gsm ?? fabricLine?.weight_gsm ?? null,
      color: fabricLine?.color ?? null,
    });
    const basisKey = fabricLine?.id ?? line.sales_order_line_id ?? null;
    const basis =
      (basisKey ? options.fabricBasisByLineId?.get(basisKey) : undefined) ??
      (fabricLine
        ? costHintFabricBasis({
            unit_price: fabricLine.unit_price,
            supplier_id: fabricLine.supplier_id,
            meters: fabricLine.quantity,
            unit: fabricLine.unit,
            // A row here is one article the client is billed for, and its fabric
            // cost is the whole line, not a share of it. A Shirt+Trouser costs
            // its 2.7 m, so 2.7 m is what has to sit beside that cost. The
            // sitewide sheet divides both by piece count instead.
            pieces: 1,
          })
        : { price_per_meter_sar: null, meters_per_piece: null });
    return {
      so_number: options.invoice.so_number,
      invoice_number: options.invoice.invoice_number,
      client_name: options.invoice.client_name,
      client_code: options.invoice.client_code,
      article_label: formatArticleFromInvoice(line.article_number, `L${String(index + 1).padStart(2, "0")}`),
      garment: line.garment_type ?? line.description,
      fabric_number: fabricNumber,
      fabric_brand: details.fabric_brand,
      supplier_id: details.supplier_id,
      composition: details.composition,
      weight_gsm: details.weight_gsm,
      color: details.color,
      quantity: line.quantity,
      price_per_meter_sar: basis.price_per_meter_sar,
      meters_per_piece: basis.meters_per_piece,
      fabric_cost_sar: line.fabric_cost_hint_sar,
      cost_hint_sar: line.cost_hint_sar,
      unit_price_sar: line.unit_price,
      missing_price: line.cost_hint_sar == null,
      article_count: Number.isFinite(line.quantity) ? Math.max(0, line.quantity) : 1,
      piece_names: pieceNamesFromInvoicePieceField(line.piece_name),
    };
  });
  const combinedRows = combineCostHintRowsByGarmentFibreWeight(rows);

  return attachArticleSummary({
    title: "Cost hint worksheet",
    subtitle: `Internal. Do not send to the client. ${options.invoice.invoice_number} / ${options.invoice.so_number}. SAR/m x meters + 5% duty on imported cloth = fabric cost. Cost hint = fabric cost + make, per article. VAT excluded.`,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    rows: combinedRows,
    missing_price_count: combinedRows.filter((row) => row.missing_price).length,
    meters_column_header: "Meters",
  });
}

export function costHintWorksheetFilename(worksheet: CostHintWorksheet): string {
  const namedLabel = namedCostHintClientLabelForRows(worksheet.rows);
  const sos = uniqueCostHintSoNumbers(worksheet.rows);
  if (namedLabel) {
    if (sos.length > 1) {
      return buildDownloadFilename(["cost-hints", namedLabel, `${sos.length}-orders`]);
    }
    return buildDownloadFilename(["cost-hints", namedLabel, sos[0]]);
  }
  const first = worksheet.rows[0];
  if (first?.invoice_number) {
    return buildDownloadFilename(["cost-hints", first.invoice_number]);
  }
  if (first && sos.length === 1) {
    return buildDownloadFilename(["cost-hints", first.so_number]);
  }
  return buildDownloadFilename(["cost-hints"]);
}
