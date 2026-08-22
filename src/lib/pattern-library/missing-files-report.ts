import { getFactoryBrands } from "@/lib/data/factory-brands";
import {
  evaluatePatternCuttingCompleteness,
  listDxfFiles,
} from "@/lib/pattern-library/cutting-completeness";
import { resolveSheetHouseBrand } from "@/lib/pattern-library/sheet-brand";
import { productionBrandNameForOrder } from "@/lib/sales-orders/production-brand";
import { getGarmentPieces, piecesForPatternJob } from "@/lib/sales-orders/label-codes";
import type { PatternJob } from "@/lib/types/pattern";
import type { ClientPattern, PatternLibraryAttachment } from "@/lib/types/pattern-library";
import type { SalesOrder } from "@/lib/types/sales-orders";

export type MissingFilesFilter = "all" | "missing_tud" | "missing_other";

export type MissingFilesPatternRow = {
  pattern_id: string | null;
  pattern_ref: string | null;
  garment_type: string;
  so_numbers: string[];
  href: string;
  has_tud: boolean;
  has_dxf: boolean;
  has_rul: boolean;
  missing_tud_labels: string[];
  no_pattern: boolean;
};

export type MissingFilesClientRow = {
  client_id: string;
  client_name: string;
  client_code: string;
  missing_tud_count: number;
  missing_other_count: number;
  patterns: MissingFilesPatternRow[];
};

export type MissingFilesBrandRow = {
  brand_name: string;
  missing_tud_count: number;
  missing_other_count: number;
  clients: MissingFilesClientRow[];
};

export type MissingFilesReport = {
  brands: MissingFilesBrandRow[];
  client_count: number;
  missing_tud_count: number;
  missing_other_count: number;
};

const ACTIVE_JOB_STATUSES = new Set([
  "pending",
  "assigned",
  "drafting",
  "awaiting_fitting",
  "revising",
  "ready_for_cutting",
  "blocked",
  "completed",
]);

function allAttachments(pattern: ClientPattern): PatternLibraryAttachment[] {
  return [...pattern.files, ...pattern.versions.flatMap((version) => version.files)];
}

export function patternHasFileKind(
  pattern: ClientPattern,
  kind: PatternLibraryAttachment["kind"]
): boolean {
  return allAttachments(pattern).some((file) => file.kind === kind);
}

function brandSortIndex(brandName: string): number {
  const names = getFactoryBrands().map((brand) => brand.name);
  const index = names.indexOf(brandName);
  return index >= 0 ? index : names.length + 1;
}

function brandNameForPattern(pattern: ClientPattern): string {
  const sheet = resolveSheetHouseBrand(pattern, null);
  if (sheet.name?.trim()) return sheet.name.trim();
  return (
    productionBrandNameForOrder({
      client_code: pattern.client_code,
      retail_brand: null,
    }) || "Other"
  );
}

function brandNameForJob(job: PatternJob, order: SalesOrder | undefined): string {
  return (
    productionBrandNameForOrder({
      client_code: order?.client_code ?? job.client_code,
      retail_brand: order?.retail_brand ?? null,
    }) || "Other"
  );
}

function rowSortKey(row: MissingFilesPatternRow): [number, number, string] {
  const tudGap = row.has_tud ? 1 : 0;
  const otherGap = row.has_dxf && row.has_rul ? 1 : 0;
  return [tudGap, otherGap, row.garment_type];
}

function toPatternRow(
  pattern: ClientPattern,
  jobs: PatternJob[]
): MissingFilesPatternRow {
  const pieces = jobs[0]
    ? piecesForPatternJob(jobs[0])
    : getGarmentPieces(pattern.garment_type);
  const cutting = evaluatePatternCuttingCompleteness(pattern, pieces);
  const soNumbers = [...new Set(jobs.map((job) => job.so_number).filter(Boolean))].sort();
  return {
    pattern_id: pattern.id,
    pattern_ref: pattern.pattern_ref,
    garment_type: pattern.garment_type,
    so_numbers: soNumbers,
    href: `/pattern/library/clients/${encodeURIComponent(pattern.id)}`,
    has_tud: cutting.tuds_complete,
    has_dxf: listDxfFiles(pattern).length > 0,
    has_rul: patternHasFileKind(pattern, "rul"),
    missing_tud_labels: cutting.missing_tud_labels,
    no_pattern: false,
  };
}

function toUnlinkedRow(job: PatternJob): MissingFilesPatternRow {
  return {
    pattern_id: null,
    pattern_ref: null,
    garment_type: job.garment_type,
    so_numbers: job.so_number ? [job.so_number] : [],
    href: `/pattern/orders/${encodeURIComponent(job.sales_order_id)}`,
    has_tud: false,
    has_dxf: false,
    has_rul: false,
    missing_tud_labels: [".TUD (no pattern sheet yet)"],
    no_pattern: true,
  };
}

function countClientGaps(patterns: MissingFilesPatternRow[]): {
  missing_tud_count: number;
  missing_other_count: number;
} {
  return {
    missing_tud_count: patterns.filter((row) => !row.has_tud).length,
    missing_other_count: patterns.filter((row) => row.has_tud && (!row.has_dxf || !row.has_rul))
      .length,
  };
}

export function filterMissingFilesReport(
  report: MissingFilesReport,
  filter: MissingFilesFilter
): MissingFilesReport {
  if (filter === "all") return report;
  const brands = report.brands
    .map((brand) => {
      const clients = brand.clients
        .map((client) => {
          const patterns =
            filter === "missing_tud"
              ? client.patterns.filter((row) => !row.has_tud)
              : client.patterns.filter((row) => row.has_tud && (!row.has_dxf || !row.has_rul));
          const gaps = countClientGaps(patterns);
          return { ...client, ...gaps, patterns };
        })
        .filter((client) => client.patterns.length > 0);
      return {
        ...brand,
        clients,
        missing_tud_count: clients.reduce((sum, client) => sum + client.missing_tud_count, 0),
        missing_other_count: clients.reduce((sum, client) => sum + client.missing_other_count, 0),
      };
    })
    .filter((brand) => brand.clients.length > 0);
  return {
    brands,
    client_count: brands.reduce((sum, brand) => sum + brand.clients.length, 0),
    missing_tud_count: brands.reduce((sum, brand) => sum + brand.missing_tud_count, 0),
    missing_other_count: brands.reduce((sum, brand) => sum + brand.missing_other_count, 0),
  };
}

export function buildMissingFilesReport(input: {
  patterns: ClientPattern[];
  jobs: PatternJob[];
  orders: SalesOrder[];
}): MissingFilesReport {
  const orderById = new Map(input.orders.map((order) => [order.id, order]));
  const liveJobs = input.jobs.filter(
    (job) => job.status !== "cancelled" && ACTIVE_JOB_STATUSES.has(job.status)
  );
  const jobsByPattern = new Map<string, PatternJob[]>();
  const unlinkedByClient = new Map<string, PatternJob[]>();

  for (const job of liveJobs) {
    const patternId = job.client_pattern_id?.trim();
    if (patternId) {
      const list = jobsByPattern.get(patternId) ?? [];
      list.push(job);
      jobsByPattern.set(patternId, list);
      continue;
    }
    const list = unlinkedByClient.get(job.client_id) ?? [];
    list.push(job);
    unlinkedByClient.set(job.client_id, list);
  }

  type AccClient = {
    client_id: string;
    client_name: string;
    client_code: string;
    brand_name: string;
    patterns: MissingFilesPatternRow[];
  };
  const clients = new Map<string, AccClient>();

  function clientKey(brandName: string, clientId: string): string {
    return `${brandName}::${clientId}`;
  }

  function ensureClient(
    brandName: string,
    clientId: string,
    clientName: string,
    clientCode: string
  ): AccClient {
    const key = clientKey(brandName, clientId);
    const existing = clients.get(key);
    if (existing) return existing;
    const created: AccClient = {
      client_id: clientId,
      client_name: clientName,
      client_code: clientCode,
      brand_name: brandName,
      patterns: [],
    };
    clients.set(key, created);
    return created;
  }

  for (const pattern of input.patterns) {
    const brandName = brandNameForPattern(pattern);
    const client = ensureClient(
      brandName,
      pattern.client_id,
      pattern.client_name,
      pattern.client_code
    );
    client.patterns.push(toPatternRow(pattern, jobsByPattern.get(pattern.id) ?? []));
  }

  for (const [clientId, jobs] of unlinkedByClient) {
    const first = jobs[0]!;
    const brandName = brandNameForJob(first, orderById.get(first.sales_order_id));
    const client = ensureClient(brandName, clientId, first.client_name, first.client_code);
    for (const job of jobs) {
      client.patterns.push(toUnlinkedRow(job));
    }
  }

  const brandsMap = new Map<string, AccClient[]>();
  for (const client of clients.values()) {
    const list = brandsMap.get(client.brand_name) ?? [];
    list.push(client);
    brandsMap.set(client.brand_name, list);
  }

  const brands: MissingFilesBrandRow[] = [...brandsMap.entries()]
    .map(([brand_name, brandClients]) => {
      const clientsRows = brandClients
        .map((client) => {
          const patterns = [...client.patterns].sort((a, b) => {
            const [aTud, aOther, aName] = rowSortKey(a);
            const [bTud, bOther, bName] = rowSortKey(b);
            if (aTud !== bTud) return aTud - bTud;
            if (aOther !== bOther) return aOther - bOther;
            return aName.localeCompare(bName);
          });
          const gaps = countClientGaps(patterns);
          return {
            client_id: client.client_id,
            client_name: client.client_name,
            client_code: client.client_code,
            ...gaps,
            patterns,
          };
        })
        .sort((a, b) => {
          if (a.missing_tud_count !== b.missing_tud_count) {
            return b.missing_tud_count - a.missing_tud_count;
          }
          if (a.missing_other_count !== b.missing_other_count) {
            return b.missing_other_count - a.missing_other_count;
          }
          return a.client_name.localeCompare(b.client_name);
        });
      return {
        brand_name,
        missing_tud_count: clientsRows.reduce((sum, client) => sum + client.missing_tud_count, 0),
        missing_other_count: clientsRows.reduce(
          (sum, client) => sum + client.missing_other_count,
          0
        ),
        clients: clientsRows,
      };
    })
    .sort((a, b) => {
      const aIdx = brandSortIndex(a.brand_name);
      const bIdx = brandSortIndex(b.brand_name);
      if (aIdx !== bIdx) return aIdx - bIdx;
      return a.brand_name.localeCompare(b.brand_name);
    });

  return {
    brands,
    client_count: brands.reduce((sum, brand) => sum + brand.clients.length, 0),
    missing_tud_count: brands.reduce((sum, brand) => sum + brand.missing_tud_count, 0),
    missing_other_count: brands.reduce((sum, brand) => sum + brand.missing_other_count, 0),
  };
}
