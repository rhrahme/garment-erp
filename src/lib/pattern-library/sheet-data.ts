import { readPatternJobs } from "@/lib/data/pattern-jobs";
import { readPatternLibraryFresh } from "@/lib/data/pattern-library";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readJsonFile } from "@/lib/data/document-persistence";
import { resolveFabricDisplayColor } from "@/lib/fabric-sourcing/resolve-fabric-display-color";
import { pieceStickersForFabricLine } from "@/lib/pattern/manufacturing-stickers";
import path from "path";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";
import type { PatternJob } from "@/lib/types/pattern";
import { fabricLineArticleCode } from "@/lib/pattern-library/client-fabric-board";
import { findActiveMarkerAttachment } from "@/lib/pattern-library/cutting-completeness";
import {
  buildCutNestPreview,
  metersFromFabricLineQuantity,
  type CutNestPreview,
} from "@/lib/pattern-library/cut-nest-preview";
import {
  CUSTOM_PATTERN_ORIGIN,
  formatBasePatternDisplayName,
} from "@/lib/pattern-library/derived-from";
import { readPatternLibraryFile } from "@/lib/pattern-library/file-storage";
import { hydrateMultiPieceGeometry } from "@/lib/pattern-library/multi-piece-geometry";
import { resolveSheetHouseBrand, type SheetHouseBrand } from "@/lib/pattern-library/sheet-brand";
import {
  fillMeasurementsFromBase,
  findBaseSizeMatch,
} from "@/lib/pattern-library/tud-size-fill";
import { findActiveTudAttachment } from "@/lib/pattern-library/tud-versions";
import type {
  BasePattern,
  ClientPattern,
  ClientPatternVersion,
  MeasurementUnit,
  PatternLibraryAttachment,
  TumMetadata,
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
  /** Ordered meters from SO fabric line when known. */
  ordered_meters?: number | null;
}

/** Optional TUKAmrk (.tum) attachment — archive/future only; shop workflow is TUD-only. */
export interface PatternSheetMarker {
  attachment: PatternLibraryAttachment;
  tum: TumMetadata | null;
  /** JPEG data URL for print/PDF, or null when no thumbnail was extracted. */
  thumbnail_data_url: string | null;
}

/** One sewing / production A4 = one fabric article, optionally one stitcher piece. */
export interface PatternSheetArticlePage {
  line_id: string;
  article_code: string;
  garment_type: string;
  so_number: string;
  order: { so_number: string; order_date: string | null; delivery_date: string | null };
  fabric: PatternSheetFabric;
  stickers: PatternSheetSticker[];
  /** When set, this page is for one stitcher piece (Overshirt / Trouser / ...). */
  piece_name?: string | null;
  /**
   * When set, print only these measurement point_ids (piece-split stitcher sheets).
   * Null/undefined = print the full trial sheet.
   */
  measurement_point_ids?: string[] | null;
  /** Companion names for piece filter when sheet point_ids drift from the dictionary. */
  measurement_point_names?: string[] | null;
}

export interface PatternSheetData {
  pattern: ClientPattern;
  version: ClientPatternVersion;
  base: BasePattern | null;
  job: PatternJob | null;
  /**
   * When set, cutter/production are scoped to this pattern job's fabric line
   * (Open job -> print). Null means consolidated multi-article pack may expand.
   */
  scoped_job_id: string | null;
  order: { so_number: string; order_date: string | null; delivery_date: string | null } | null;
  fabric: PatternSheetFabric | null;
  stickers: PatternSheetSticker[];
  /**
   * Sewing / production pack: one page per linked article (then split per piece
   * at print time). Empty when the pattern has no SO fabric lines with stickers.
   */
  article_pages: PatternSheetArticlePage[];
  /**
   * Slim dictionary ids + garment_types so stitcher piece pages can filter
   * Overshirt vs Trouser measurements client-side.
   */
  measurement_point_index: Array<{ id: string; name?: string; garment_types: string[] }>;
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
  /** Approximate cut nest for the cutter handoff (folded fabric placement). */
  cut_nest: CutNestPreview;
  /**
   * Optional shop TUKAmrk marker when attached. Not required for TUD-only workflow.
   */
  marker: PatternSheetMarker | null;
  /**
   * Embedded TUD JFIF preview (100x100 source) as data URL for A4 - visual
   * reference only; not a substitute for CAD outlines.
   */
  tud_thumbnail_data_url: string | null;
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
    color: resolveFabricDisplayColor({
      supplier_id: line.supplier_id,
      fabric_number: line.fabric_number,
      color: line.color,
    }),
    ordered_meters: metersFromFabricLineQuantity(line.quantity, line.unit),
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
 * are linked. Pure - does not persist. Returns a warning when fill is impossible
 * and the sheet still has empty base cells.
 */
export function applySheetBaseMeasurements(
  version: ClientPatternVersion,
  base: BasePattern | null,
  baseSize: string | null,
  sheetUnit?: MeasurementUnit | null
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

  const outcome = fillMeasurementsFromBase(version.measurements, base, resolved, {
    sheetUnit: sheetUnit ?? null,
  });
  return {
    version: { ...version, measurements: outcome.measurements },
    resolved_base_size: resolved,
    base_fill_warning: null,
  };
}

function buildArticlePagesForPattern(
  pattern: ClientPattern,
  salesOrders: SalesOrder[],
  lineIds: string[] | null | undefined
): PatternSheetArticlePage[] {
  const linked = pattern.linked_fabric_line_ids ?? [];
  // Default = all linked articles. Explicit selection keeps linked order first.
  const orderedIds =
    lineIds == null
      ? linked
      : [
          ...linked.filter((id) => lineIds.includes(id)),
          ...lineIds.filter((id) => !linked.includes(id)),
        ];
  const pages: PatternSheetArticlePage[] = [];
  const seen = new Set<string>();
  for (const lineId of orderedIds) {
    if (seen.has(lineId)) continue;
    seen.add(lineId);
    const found = findOrderLine(salesOrders, lineId);
    if (!found) continue;
    const lineIndex = found.order.fabric_lines.findIndex((row) => row.id === lineId);
    pages.push({
      line_id: lineId,
      article_code: fabricLineArticleCode(found.order, found.line, Math.max(0, lineIndex)),
      garment_type: found.line.garment_type || pattern.garment_type,
      so_number: found.order.so_number,
      order: {
        so_number: found.order.so_number,
        order_date: found.order.order_date ?? null,
        delivery_date: found.order.delivery_date ?? null,
      },
      fabric: fabricFromLine(found.line),
      stickers: stickersFromLine(found.line, found.order.client_code),
    });
  }
  return pages;
}

/**
 * Assembles everything the printable A4 sheet needs: pattern + trial, its base
 * pattern, the linked pattern job (explicit jobId first, else the most recent
 * job referencing this pattern), fabric spec from the job or first linked fabric
 * line, order header, and sticker QRs (job line, else primary linked fabric).
 * Optional `lineIds` selects which linked articles appear in `article_pages`
 * (sewing A4 pack).
 */
export async function buildPatternSheetData(
  patternId: string,
  options: {
    versionId?: string | null;
    jobId?: string | null;
    /** Force one SO fabric line (from Open job / Print A4). */
    lineId?: string | null;
    lineIds?: string[] | null;
  } = {}
): Promise<PatternSheetData | null> {
  await ensureDocumentsLoaded(["pattern_library", "pattern_jobs", "sales_orders", "clients"]);
  const library = await readPatternLibraryFresh();
  const rawPattern =
    library.client_patterns.find((candidate) => candidate.id === patternId) ?? null;
  if (!rawPattern) return null;
  // Suit / Shirt+Short shells: borrow Jacket/Trouser TUD+DXF from sibling patterns.
  const pattern = hydrateMultiPieceGeometry(rawPattern, library.client_patterns).pattern;

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

  const filled = applySheetBaseMeasurements(
    rawVersion,
    base,
    pattern.base_size,
    pattern.unit
  );
  const version = filled.version;

  const jobs = readPatternJobs().jobs;
  const linkedLineIds = pattern.linked_fabric_line_ids ?? [];
  const multiArticle = linkedLineIds.length > 1;
  const requestedJobId = options.jobId?.trim() || null;
  const requestedLineId = options.lineId?.trim() || null;
  let job: PatternJob | null = null;
  if (requestedJobId) {
    job = jobs.find((candidate) => candidate.id === requestedJobId) ?? null;
  }
  // Job id missing/stale: resolve by the fabric line opened from the job page.
  if (!job && requestedLineId) {
    const byLine = jobs.filter(
      (candidate) => candidate.sales_order_line_id === requestedLineId
    );
    job =
      byLine.find((candidate) => candidate.client_pattern_id === pattern.id) ??
      byLine[0] ??
      null;
  }
  // Consolidated masters: never guess "most recent job" - that stamps every
  // cutter/production sheet with one fabric. Single-article patterns still
  // fall back to the latest linked job when jobId is omitted.
  if (!job && !requestedJobId && !requestedLineId && !multiArticle) {
    job =
      jobs
        .filter((candidate) => candidate.client_pattern_id === pattern.id)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
  }

  const salesOrders = readSalesOrdersFile().orders;
  let order: PatternSheetData["order"] = null;
  let stickers: PatternSheetSticker[] = [];
  let fabric: PatternSheetData["fabric"] = null;

  let orderedMeters: number | null = null;
  const scopedLineId = requestedLineId || job?.sales_order_line_id || null;
  // Opened from a fabric job (or explicit line): never fall back to another
  // linked article's fabric / QR.
  const explicitScope = Boolean(requestedJobId || requestedLineId);

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
        (candidate) => candidate.id === (scopedLineId || job!.sales_order_line_id)
      );
      if (line) {
        stickers = stickersFromLine(line, salesOrder.client_code);
        orderedMeters = metersFromFabricLineQuantity(line.quantity, line.unit);
        const fromLine = fabricFromLine(line);
        fabric = {
          ...fromLine,
          fabric_number: job.fabric_number || fromLine.fabric_number,
          supplier_name: job.supplier || fromLine.supplier_name,
          ordered_meters: orderedMeters,
        };
      }
    }
  }

  // Explicit line without a job row: still load that SO line's fabric + stickers.
  if (explicitScope && scopedLineId && !fabric) {
    const found = findOrderLine(salesOrders, scopedLineId);
    if (found) {
      fabric = fabricFromLine(found.line);
      stickers = stickersFromLine(found.line, found.order.client_code);
      orderedMeters = metersFromFabricLineQuantity(found.line.quantity, found.line.unit);
      fabric = { ...fabric, ordered_meters: orderedMeters };
      order = {
        so_number: found.order.so_number,
        order_date: found.order.order_date ?? null,
        delivery_date: found.order.delivery_date ?? null,
      };
    }
  }

  // Linked fabric lines - only when this sheet is not scoped to a job/line.
  if (!explicitScope) {
    for (const lineId of linkedLineIds) {
      const found = findOrderLine(salesOrders, lineId);
      if (!found) continue;
      if (!fabric) fabric = fabricFromLine(found.line);
      if (orderedMeters == null) {
        orderedMeters = metersFromFabricLineQuantity(found.line.quantity, found.line.unit);
        if (fabric && fabric.ordered_meters == null) {
          fabric = { ...fabric, ordered_meters: orderedMeters };
        }
      }
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
  }

  // Job/line scope -> only that article. Else sewing tick-list / all linked.
  const articleLineFilter =
    explicitScope && scopedLineId
      ? [scopedLineId]
      : options.lineIds;
  const article_pages = buildArticlePagesForPattern(pattern, salesOrders, articleLineFilter);

  // Sewing pack with an explicit selection: seed primary fabric/stickers from
  // the first selected article so cutter/production fallbacks stay coherent.
  if (!explicitScope && options.lineIds != null && article_pages[0]) {
    const first = article_pages[0];
    if (!fabric) fabric = first.fabric;
    if (stickers.length === 0) stickers = first.stickers;
    if (!order) order = first.order;
  }

  const cut_nest = buildCutNestPreview(pattern, fabric?.width_cm ?? job?.width_cm ?? null, {
    size: filled.resolved_base_size ?? pattern.base_size,
    garmentQty: 1,
    ordered_length_m: orderedMeters ?? fabric?.ordered_meters ?? null,
  });

  const markerAttachment = findActiveMarkerAttachment(pattern);
  let marker: PatternSheetMarker | null = null;
  if (markerAttachment) {
    let thumbnail_data_url: string | null = null;
    if (markerAttachment.thumbnail_stored_filename) {
      const thumb = await readPatternLibraryFile(markerAttachment.thumbnail_stored_filename);
      if (thumb) {
        thumbnail_data_url = `data:image/jpeg;base64,${thumb.toString("base64")}`;
      }
    }
    marker = {
      attachment: markerAttachment,
      tum: markerAttachment.tum ?? null,
      thumbnail_data_url,
    };
  }

  let tud_thumbnail_data_url: string | null = null;
  const tudAttachment = findActiveTudAttachment(pattern);
  if (tudAttachment?.thumbnail_stored_filename) {
    const thumb = await readPatternLibraryFile(tudAttachment.thumbnail_stored_filename);
    if (thumb) {
      tud_thumbnail_data_url = `data:image/jpeg;base64,${thumb.toString("base64")}`;
    }
  }

  const measurement_point_index = (library.dictionary ?? []).map((point) => ({
    id: point.id,
    name: point.name,
    garment_types: Array.isArray(point.garment_types) ? point.garment_types : [],
  }));

  return {
    pattern,
    version,
    base,
    job,
    scoped_job_id: requestedJobId || (explicitScope && job ? job.id : null),
    order,
    fabric,
    stickers,
    article_pages,
    measurement_point_index,
    derived_from: describeDerivedFrom(base, pattern.base_size),
    house_brand: resolveSheetHouseBrand(pattern, base),
    base_fill_warning: filled.base_fill_warning,
    resolved_base_size: filled.resolved_base_size,
    cut_nest,
    marker,
    tud_thumbnail_data_url,
  };
}
