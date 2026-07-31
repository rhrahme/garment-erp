import { readPatternJobs } from "@/lib/data/pattern-jobs";
import { readPatternLibraryFresh } from "@/lib/data/pattern-library";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readJsonFile } from "@/lib/data/document-persistence";
import { pieceStickersForFabricLine } from "@/lib/pattern/manufacturing-stickers";
import path from "path";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";
import type { PatternJob } from "@/lib/types/pattern";
import {
  CUSTOM_PATTERN_ORIGIN,
  formatBasePatternDisplayName,
} from "@/lib/pattern-library/derived-from";
import { resolveSheetHouseBrand, type SheetHouseBrand } from "@/lib/pattern-library/sheet-brand";
import {
  fillMeasurementsFromBase,
  findBaseSizeMatch,
} from "@/lib/pattern-library/tud-size-fill";
import type {
  BasePattern,
  ClientPattern,
  ClientPatternVersion,
} from "@/lib/types/pattern-library";

const SALES_ORDERS_PATH = path.join(process.cwd(), "src/data/sales-orders.json");

/** Manufacturing / floor scan QR on the printable size sheet (one piece per page). */
export interface PatternSheetSticker {
  code: string;
  piece_name: string;
  production_code: string;
  qr_payload: string;
  role: "piece" | "prep";
  piece_index: number | null;
  piece_total: number | null;
}

export interface PatternSheetFabric {
  fabric_number: string;
  supplier_name: string;
  composition: string | null;
  gsm: number | null;
  width_cm: number | null;
  width_inches: number | null;
  color: string | null;
}

export interface PatternSheetData {
  pattern: ClientPattern;
  version: ClientPatternVersion;
  base: BasePattern | null;
  job: PatternJob | null;
  order: { so_number: string; order_date: string | null; delivery_date: string | null } | null;
  fabric: PatternSheetFabric | null;
  stickers: PatternSheetSticker[];
  derived_from: string | null;
  /** Letterhead brand (code + name) for the top-right block. */
  house_brand: SheetHouseBrand;
  /**
   * When Base/Target cannot be pre-filled (no base, no size, or size missing
   * on the base), surface a clear message on the sheet.
   */
  base_fill_warning: string | null;
  /** Size column used for the fill (base's own spelling after 2XL↔XXL match). */
  resolved_base_size: string | null;
}

function readSalesOrdersFile(): { orders: SalesOrder[] } {
  return readJsonFile(SALES_ORDERS_PATH, { updated_at: null, orders: [] as SalesOrder[] });
}

/** Library base label, or "Custom" when built from scratch. */
export function describeDerivedFrom(base: BasePattern | null, size: string | null): string {
  const name = formatBasePatternDisplayName(base);
  if (!name) return CUSTOM_PATTERN_ORIGIN;
  return size ? `${name} · ${size}` : name;
}

function fabricFromLine(line: SalesOrderFabricLine): PatternSheetFabric {
  return {
    fabric_number: line.fabric_number,
    supplier_name: line.supplier_name,
    composition: line.composition ?? null,
    gsm: line.weight_gsm ?? null,
    width_cm: line.width_cm ?? null,
    width_inches: line.width_inches ?? null,
    color: line.color ?? null,
  };
}

function stickersFromLine(
  line: SalesOrderFabricLine,
  clientCode: string
): PatternSheetSticker[] {
  // One piece QR per A4 page — Suit -> Jacket + Trouser (no fabric-cut prep on size sheet).
  return pieceStickersForFabricLine(line, clientCode).map((sticker) => ({
    code: sticker.code,
    piece_name: sticker.piece_name,
    production_code: sticker.production_code,
    qr_payload: sticker.qr_payload,
    role: sticker.role,
    piece_index: sticker.piece_index,
    piece_total: sticker.piece_total,
  }));
}

function findOrderLine(
  orders: SalesOrder[],
  lineId: string
): { order: SalesOrder; line: SalesOrderFabricLine } | null {
  for (const order of orders) {
    const line = order.fabric_lines.find((candidate) => candidate.id === lineId);
    if (line) return { order, line };
  }
  return null;
}

/**
 * Pre-fills empty base/target cells for the printable sheet when a base + size
 * are linked. Pure — does not persist. Returns a warning when fill is impossible
 * and the sheet still has empty base cells.
 */
export function applySheetBaseMeasurements(
  version: ClientPatternVersion,
  base: BasePattern | null,
  baseSize: string | null
): {
  version: ClientPatternVersion;
  resolved_base_size: string | null;
  base_fill_warning: string | null;
} {
  const hasEmptyBase = version.measurements.some((row) => row.base_value === null);

  if (!base || !baseSize?.trim()) {
    let warning: string | null = null;
    if (hasEmptyBase) {
      if (!base && baseSize?.trim()) {
        warning = "Link a base pattern first to pre-fill Base / Target columns.";
      } else if (base && !baseSize?.trim()) {
        warning = "Set a base size first to pre-fill Base / Target columns.";
      } else {
        warning = "Link a base pattern and size first to pre-fill Base / Target columns.";
      }
    }
    return {
      version,
      resolved_base_size: null,
      base_fill_warning: warning,
    };
  }

  const resolved = findBaseSizeMatch(baseSize, base.sizes);
  if (!resolved) {
    return {
      version,
      resolved_base_size: null,
      base_fill_warning: hasEmptyBase
        ? `Size ${baseSize} is not on the linked base (${base.sizes.join(", ") || "no sizes"}).`
        : null,
    };
  }

  const outcome = fillMeasurementsFromBase(version.measurements, base, resolved);
  return {
    version: { ...version, measurements: outcome.measurements },
    resolved_base_size: resolved,
    base_fill_warning: null,
  };
}

/**
 * Assembles everything the printable A4 sheet needs: pattern + trial, its base
 * pattern, the linked pattern job (explicit jobId first, else the most recent
 * job referencing this pattern), fabric spec from the job or first linked fabric
 * line, order header, and sticker QRs (job line, else primary linked fabric).
 */
export async function buildPatternSheetData(
  patternId: string,
  options: { versionId?: string | null; jobId?: string | null } = {}
): Promise<PatternSheetData | null> {
  await ensureDocumentsLoaded(["pattern_library", "pattern_jobs", "sales_orders", "clients"]);
  const library = await readPatternLibraryFresh();
  const pattern = library.client_patterns.find((candidate) => candidate.id === patternId) ?? null;
  if (!pattern) return null;

  const rawVersion =
    (options.versionId
      ? pattern.versions.find((candidate) => candidate.id === options.versionId)
      : null) ??
    (pattern.final_version_id
      ? pattern.versions.find((candidate) => candidate.id === pattern.final_version_id)
      : null) ??
    pattern.versions[pattern.versions.length - 1] ??
    null;
  if (!rawVersion) return null;

  const base = pattern.base_pattern_id
    ? library.base_patterns.find((candidate) => candidate.id === pattern.base_pattern_id) ?? null
    : null;

  const filled = applySheetBaseMeasurements(rawVersion, base, pattern.base_size);
  const version = filled.version;

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

  const salesOrders = readSalesOrdersFile().orders;
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
    const salesOrder = salesOrders.find((candidate) => candidate.id === job!.sales_order_id);
    if (salesOrder) {
      order = {
        so_number: salesOrder.so_number,
        order_date: salesOrder.order_date ?? null,
        delivery_date: salesOrder.delivery_date ?? null,
      };
      const line = salesOrder.fabric_lines.find(
        (candidate) => candidate.id === job!.sales_order_line_id
      );
      if (line) stickers = stickersFromLine(line, salesOrder.client_code);
    }
  }

  // Linked fabric lines (client fabric board) — primary/first for article QR +
  // fabric block when no pattern job is attached.
  const linkedLineIds = pattern.linked_fabric_line_ids ?? [];
  for (const lineId of linkedLineIds) {
    const found = findOrderLine(salesOrders, lineId);
    if (!found) continue;
    if (!fabric) fabric = fabricFromLine(found.line);
    if (!order) {
      order = {
        so_number: found.order.so_number,
        order_date: found.order.order_date ?? null,
        delivery_date: found.order.delivery_date ?? null,
      };
    }
    if (stickers.length === 0 && (found.line.label_stickers?.length ?? 0) > 0) {
      stickers = stickersFromLine(found.line, found.order.client_code);
    }
    // Primary = first linked id; stop after first resolved line for QR source.
    if (stickers.length > 0 || fabric) break;
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
    house_brand: resolveSheetHouseBrand(pattern, base),
    base_fill_warning: filled.base_fill_warning,
    resolved_base_size: filled.resolved_base_size,
  };
}
