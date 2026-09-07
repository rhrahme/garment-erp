import { getBrandClientCodePrefix } from "@/lib/clients/codes";
import type { CostingOverview, FabricLineCost, SalesOrderCost } from "@/lib/costing/compute";
import { buildDownloadFilename } from "@/lib/pdf/download-filename";
import type { CustomerInvoice } from "@/lib/types/customer-invoices";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

export type CostHintWorksheetRow = {
  so_number: string;
  invoice_number: string | null;
  client_name: string;
  client_code: string;
  article_label: string;
  garment: string;
  fabric_number: string;
  composition: string | null;
  quantity: number;
  fabric_cost_sar: number | null;
  cost_hint_sar: number | null;
  unit_price_sar: number | null;
  missing_price: boolean;
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
  return {
    so_number: input.order.so_number,
    invoice_number: input.selling?.invoice_number ?? null,
    client_name: input.order.client_name,
    client_code: input.order.client_code,
    article_label: articleLabelFromNumber(input.line.article_number),
    garment: input.line.garment_type,
    fabric_number: input.line.fabric_number,
    composition: input.line.composition,
    quantity: input.selling?.quantity ?? pieces,
    fabric_cost_sar: fabricCost,
    cost_hint_sar: costHint,
    unit_price_sar: input.selling?.unit_price_sar ?? null,
    missing_price: !input.line.has_fabric_price,
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
  generatedAt?: string;
}): CostHintWorksheet {
  const rows: CostHintWorksheetRow[] = (options.invoice.lines ?? []).map((line, index) => ({
    so_number: options.invoice.so_number,
    invoice_number: options.invoice.invoice_number,
    client_name: options.invoice.client_name,
    client_code: options.invoice.client_code,
    article_label: formatArticleFromInvoice(line.article_number, `L${String(index + 1).padStart(2, "0")}`),
    garment: line.garment_type ?? line.description,
    fabric_number: line.fabric_number ?? "",
    composition: line.composition,
    quantity: line.quantity,
    fabric_cost_sar: line.fabric_cost_hint_sar,
    cost_hint_sar: line.cost_hint_sar,
    unit_price_sar: line.unit_price,
    missing_price: line.cost_hint_sar == null,
  }));

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
