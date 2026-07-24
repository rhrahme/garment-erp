import { readPatternJobs } from "@/lib/data/pattern-jobs";
import { readPatternLibraryFresh } from "@/lib/data/pattern-library";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readJsonFile } from "@/lib/data/document-persistence";
import { productionCodeFromSticker } from "@/lib/sales-orders/label-codes";
import { qrScanPayload } from "@/lib/production/qr-labels";
import path from "path";
import type { SalesOrder } from "@/lib/types/sales-orders";
import type { PatternJob } from "@/lib/types/pattern";
import type {
  BasePattern,
  ClientPattern,
  ClientPatternVersion,
} from "@/lib/types/pattern-library";

const SALES_ORDERS_PATH = path.join(process.cwd(), "src/data/sales-orders.json");

export interface PatternSheetSticker {
  code: string;
  piece_name: string;
  qr_payload: string;
}

export interface PatternSheetData {
  pattern: ClientPattern;
  version: ClientPatternVersion;
  base: BasePattern | null;
  job: PatternJob | null;
  order: { so_number: string; order_date: string | null; delivery_date: string | null } | null;
  fabric: {
    fabric_number: string;
    supplier_name: string;
    composition: string | null;
    gsm: number | null;
    width_cm: number | null;
    width_inches: number | null;
    color: string | null;
  } | null;
  stickers: PatternSheetSticker[];
  derived_from: string | null;
}

function readSalesOrdersFile(): { orders: SalesOrder[] } {
  return readJsonFile(SALES_ORDERS_PATH, { updated_at: null, orders: [] as SalesOrder[] });
}

export function describeDerivedFrom(base: BasePattern | null, size: string | null): string | null {
  if (!base) return null;
  const bits = [
    base.house_brand_code,
    base.cut_family,
    base.garment_type,
    base.cut_variant,
    size,
  ].filter(Boolean);
  return bits.join(" / ");
}

/**
 * Assembles everything the printable A4 sheet needs: pattern + trial, its base
 * pattern, the linked pattern job (explicit jobId first, else the most recent
 * job referencing this pattern), fabric spec, order header, and sticker QRs.
 */
export async function buildPatternSheetData(
  patternId: string,
  options: { versionId?: string | null; jobId?: string | null } = {}
): Promise<PatternSheetData | null> {
  await ensureDocumentsLoaded(["pattern_library", "pattern_jobs", "sales_orders", "clients"]);
  const library = await readPatternLibraryFresh();
  const pattern = library.client_patterns.find((candidate) => candidate.id === patternId) ?? null;
  if (!pattern) return null;

  const version =
    (options.versionId
      ? pattern.versions.find((candidate) => candidate.id === options.versionId)
      : null) ??
    (pattern.final_version_id
      ? pattern.versions.find((candidate) => candidate.id === pattern.final_version_id)
      : null) ??
    pattern.versions[pattern.versions.length - 1] ??
    null;
  if (!version) return null;

  const base = pattern.base_pattern_id
    ? library.base_patterns.find((candidate) => candidate.id === pattern.base_pattern_id) ?? null
    : null;

  const jobs = readPatternJobs().jobs;
  let job: PatternJob | null = null;
  if (options.jobId) {
    job = jobs.find((candidate) => candidate.id === options.jobId) ?? null;
  }
  if (!job) {
    job =
      jobs
        .filter((candidate) => candidate.client_pattern_id === pattern.id)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
  }

  let order: PatternSheetData["order"] = null;
  let stickers: PatternSheetSticker[] = [];
  let fabric: PatternSheetData["fabric"] = null;

  if (job) {
    fabric = {
      fabric_number: job.fabric_number,
      supplier_name: job.supplier,
      composition: job.composition,
      gsm: job.gsm,
      width_cm: job.width_cm,
      width_inches: job.width_inches,
      color: job.color,
    };
    const salesOrder = readSalesOrdersFile().orders.find(
      (candidate) => candidate.id === job!.sales_order_id
    );
    if (salesOrder) {
      order = {
        so_number: salesOrder.so_number,
        order_date: salesOrder.order_date ?? null,
        delivery_date: salesOrder.delivery_date ?? null,
      };
      const line = salesOrder.fabric_lines.find(
        (candidate) => candidate.id === job!.sales_order_line_id
      );
      stickers = (line?.label_stickers ?? []).map((sticker) => ({
        code: sticker.code,
        piece_name: sticker.piece_name,
        qr_payload: qrScanPayload(productionCodeFromSticker(sticker.code, salesOrder.client_code)),
      }));
    }
  }

  return {
    pattern,
    version,
    base,
    job,
    order,
    fabric,
    stickers,
    derived_from: describeDerivedFrom(base, pattern.base_size),
  };
}
