import { getBrandClientCodePrefix } from "@/lib/clients/codes";
import type { CostingOverview, FabricLineCost, SalesOrderCost } from "@/lib/costing/compute";
import { resolveFabricSwatchUrls } from "@/lib/fabric-sourcing/fabric-swatch-keys";
import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import { formatInvoiceFibreContent } from "@/lib/invoicing/display";
import { buildDownloadFilename } from "@/lib/pdf/download-filename";
import { getLabelCountForGarment, GARMENT_STITCH_TYPES } from "@/lib/sales-orders/garment-types";
import type { CustomerInvoice } from "@/lib/types/customer-invoices";
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
  fabric_cost_sar: number | null;
  cost_hint_sar: number | null;
  unit_price_sar: number | null;
  missing_price: boolean;
  article_count: number;
};

export type CostHintArticleSummaryItem = {
  label: string;
  count: number;
};

export type CostHintArticleSummary = {
  items: CostHintArticleSummaryItem[];
  total_articles: number;
};

export type CostHintWorksheet = {
  title: string;
  subtitle: string;
  generated_at: string;
  rows: CostHintWorksheetRow[];
  missing_price_count: number;
};

export function articleLabelFromNumber(articleNumber: number): string {
  return `L${String(articleNumber).padStart(2, "0")}`;
}

export function pieceCountForFabricLine(line: Pick<SalesOrderFabricLine, "label_count" | "label_stickers">): number {
  return Math.max(line.label_stickers?.length ?? line.label_count ?? 1, 1);
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
  const preferred = ["Shirt", "Overshirt", "Suit"];
  const preferredIndex = preferred.indexOf(label);
  if (preferredIndex >= 0) return preferredIndex;
  const typeIndex = (GARMENT_STITCH_TYPES as readonly string[]).indexOf(label);
  return typeIndex >= 0 ? 100 + typeIndex : 1000;
}

export function summarizeCostHintArticles(rows: CostHintWorksheetRow[]): CostHintArticleSummary {
  const counts = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    const count = Number.isFinite(row.article_count) ? Math.max(0, row.article_count) : 1;
    if (count === 0) continue;
    const label = costHintGarmentFamily(row.garment);
    counts.set(label, (counts.get(label) ?? 0) + count);
    total += count;
  }
  const items = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort(
      (a, b) =>
        garmentFamilySortIndex(a.label) - garmentFamilySortIndex(b.label) ||
        a.label.localeCompare(b.label)
    );
  return { items, total_articles: total };
}

export function formatCostHintArticleSummary(summary: CostHintArticleSummary): string {
  const parts = summary.items.map(
    (item) => `${item.count} ${pluralizeCostHintGarment(item.label, item.count)}`
  );
  const total = `Total articles: ${summary.total_articles}`;
  return parts.length > 0 ? `${parts.join(", ")}. ${total}` : total;
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

export function sellingPriceByFabricLineId(invoices: CustomerInvoice[]): Map<
  string,
  { invoice_number: string; unit_price_sar: number; quantity: number }
> {
  const map = new Map<string, { invoice_number: string; unit_price_sar: number; quantity: number }>();
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
    fabric_cost_sar: fabricCost,
    cost_hint_sar: costHint,
    unit_price_sar: input.selling?.unit_price_sar ?? null,
    missing_price: !input.line.has_fabric_price,
    article_count: articleCount,
  };
}

export function buildCostHintWorksheet(options: {
  overview: CostingOverview;
  salesOrders: SalesOrder[];
  invoices?: CustomerInvoice[];
  brandId?: string | null;
  soNumber?: string | null;
  includeArchived?: boolean;
  generatedAt?: string;
}): CostHintWorksheet {
  const soById = new Map(options.salesOrders.map((order) => [order.id, order]));
  const selling = sellingPriceByFabricLineId(options.invoices ?? []);
  const soFilter = options.soNumber?.trim().toUpperCase() ?? "";
  const rows: CostHintWorksheetRow[] = [];

  for (const order of options.overview.orders) {
    if (!options.includeArchived && order.is_archived) continue;
    if (!matchesBrand(order.client_code, options.brandId)) continue;
    if (soFilter && order.so_number.toUpperCase() !== soFilter) continue;
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

  const scope = soFilter
    ? soFilter
    : options.brandId
      ? `${options.brandId} brand`
      : "all orders";

  return {
    title: "Cost hint worksheet",
    subtitle: `Internal. Do not send to the client. ${scope}. Cost hint = fabric + 5% duty + make, per piece. VAT excluded.`,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    rows,
    missing_price_count: rows.filter((row) => row.missing_price).length,
  };
}

export function buildCostHintWorksheetFromInvoice(options: {
  invoice: CustomerInvoice;
  salesOrder?: SalesOrder | null;
  generatedAt?: string;
}): CostHintWorksheet {
  const fabricById = new Map((options.salesOrder?.fabric_lines ?? []).map((line) => [line.id, line]));
  const rows: CostHintWorksheetRow[] = (options.invoice.lines ?? []).map((line, index) => {
    const fabricLine = line.sales_order_line_id ? fabricById.get(line.sales_order_line_id) : undefined;
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
      fabric_cost_sar: line.fabric_cost_hint_sar,
      cost_hint_sar: line.cost_hint_sar,
      unit_price_sar: line.unit_price,
      missing_price: line.cost_hint_sar == null,
      article_count: Number.isFinite(line.quantity) ? Math.max(0, line.quantity) : 1,
    };
  });

  return {
    title: "Cost hint worksheet",
    subtitle: `Internal. Do not send to the client. ${options.invoice.invoice_number} / ${options.invoice.so_number}. Cost hint = fabric + 5% duty + make, per piece. VAT excluded.`,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    rows,
    missing_price_count: rows.filter((row) => row.missing_price).length,
  };
}

export function costHintWorksheetFilename(worksheet: CostHintWorksheet): string {
  const first = worksheet.rows[0];
  if (first?.invoice_number) {
    return buildDownloadFilename(["cost-hints", first.invoice_number]);
  }
  if (first && worksheet.rows.every((row) => row.so_number === first.so_number)) {
    return buildDownloadFilename(["cost-hints", first.so_number]);
  }
  return buildDownloadFilename(["cost-hints"]);
}
