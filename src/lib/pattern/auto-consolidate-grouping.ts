/**
 * Pure grouping / planning for pattern auto-consolidate by fit family:
 * same garment type family + composition + weight (gsm).
 *
 * Keep this module free of data-store / mutation imports so unit tests stay light.
 */

import { formatClientInvoiceComposition } from "@/lib/invoicing/display";
import { normalizePatternSheetGarment } from "@/lib/pattern-library/base-pattern-picker";
import { GARMENT_STITCH_TYPES } from "@/lib/sales-orders/garment-types";
import type { PatternJob } from "@/lib/types/pattern";
import type { ClientPattern } from "@/lib/types/pattern-library";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

export type FitFamilyKeyParts = {
  garment_family: string;
  composition_key: string;
  weight_gsm: number;
};

export type AutoConsolidateJobInput = Pick<
  PatternJob,
  | "id"
  | "client_id"
  | "client_name"
  | "client_code"
  | "garment_type"
  | "composition"
  | "gsm"
  | "sales_order_id"
  | "sales_order_line_id"
  | "client_pattern_id"
  | "status"
  | "fabric_number"
>;

export type AutoConsolidatePlanGroup = {
  client_id: string;
  client_name: string;
  client_code: string;
  fit_key: string;
  garment_family: string;
  /** Canonical sheet garment for createClientPattern. */
  garment_type: string;
  composition_key: string;
  composition_display: string;
  weight_gsm: number;
  job_ids: string[];
  line_ids: string[];
  preferred_pattern_id: string | null;
  action: "link_existing" | "create" | "noop";
};

export type CrossClientFitFamily = {
  fit_key: string;
  garment_family: string;
  garment_type: string;
  composition_key: string;
  composition_display: string;
  weight_gsm: number;
  clients: Array<{
    client_id: string;
    client_name: string;
    client_code: string;
    job_count: number;
    pattern_ids: string[];
  }>;
};

export type AutoConsolidatePlan = {
  groups: AutoConsolidatePlanGroup[];
  cross_client_fit_families: CrossClientFitFamily[];
  skipped_incomplete_key: number;
  skipped_cancelled_or_orphan: number;
};

export type AutoConsolidateResult = {
  groups_formed: number;
  groups_acted: number;
  jobs_linked: number;
  patterns_created: number;
  patterns_reused: number;
  noop_groups: number;
  skipped_incomplete_key: number;
  skipped_cancelled_or_orphan: number;
  cross_client_fit_families: CrossClientFitFamily[];
  groups: AutoConsolidatePlanGroup[];
  linked_job_ids: string[];
  created_pattern_ids: string[];
};

export type AutoConsolidateOptions = {
  /** Limit to jobs on this sales order. */
  sales_order_id?: string | null;
  /** Limit to one client. */
  client_id?: string | null;
  /** When true, plan only - no writes. */
  dry_run?: boolean;
  actedBy?: string | null;
  notify?: boolean;
  /**
   * Unit for newly created measurement sheets. Must match how Pattern types
   * numbers (Units toggle). Defaulting to inches without this mislabels CM
   * entries as inches with no conversion (e.g. 76 cm stored as 76 in).
   */
  unit?: "cm" | "in" | null;
};

/** Short/shorts/Shorts and case variants map to the sales stitch label. */
const GARMENT_FAMILY_ALIASES: Record<string, string> = {
  short: "Short",
  shorts: "Short",
  trouser: "Trouser",
  trousers: "Trouser",
  pants: "Trouser",
  pant: "Trouser",
};

/**
 * Canonical garment sheet type for storage / ClientPattern.
 * Aliases Shorts -> Short; otherwise stitch-type case match.
 */
export function canonicalPatternGarmentType(garmentType: string): string {
  const trimmed = garmentType.trim();
  if (!trimmed) return "";
  const alias = GARMENT_FAMILY_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  return normalizePatternSheetGarment(trimmed) || trimmed;
}

/**
 * Normalized family key for grouping (lowercase canonical sheet type).
 * Suit stays "suit"; Jacket/Trouser stay separate - do not collapse suit pieces.
 */
export function normalizeGarmentTypeFamily(garmentType: string): string {
  const canonical = canonicalPatternGarmentType(garmentType);
  if (!canonical) return "";
  const stitch = GARMENT_STITCH_TYPES.find(
    (type) => type.toLowerCase() === canonical.toLowerCase()
  );
  return (stitch ?? canonical).toLowerCase();
}

export function normalizeCompositionKey(composition: string | null | undefined): string {
  const raw = composition?.trim();
  if (!raw) return "";
  return formatClientInvoiceComposition(raw).toLowerCase().replace(/\s+/g, " ").trim();
}

export function normalizeWeightGsm(gsm: number | null | undefined): number | null {
  if (gsm == null || !Number.isFinite(gsm)) return null;
  return Math.round(Number(gsm));
}

export function buildFitFamilyKey(parts: {
  garment_type: string;
  composition: string | null | undefined;
  gsm: number | null | undefined;
}): string | null {
  const garment_family = normalizeGarmentTypeFamily(parts.garment_type);
  const composition_key = normalizeCompositionKey(parts.composition);
  const weight_gsm = normalizeWeightGsm(parts.gsm);
  if (!garment_family || !composition_key || weight_gsm == null) return null;
  return `${garment_family}|${composition_key}|${weight_gsm}`;
}

export function parseFitFamilyKey(fitKey: string): FitFamilyKeyParts | null {
  const parts = fitKey.split("|");
  if (parts.length < 3) return null;
  const weight_gsm = Number(parts[parts.length - 1]);
  if (!Number.isFinite(weight_gsm)) return null;
  const garment_family = parts[0] ?? "";
  const composition_key = parts.slice(1, -1).join("|");
  if (!garment_family || !composition_key) return null;
  return { garment_family, composition_key, weight_gsm };
}

export function isActivePatternJobForOrders(
  job: Pick<PatternJob, "status" | "sales_order_id" | "sales_order_line_id">,
  ordersById: Map<string, SalesOrder>
): boolean {
  if (job.status === "cancelled") return false;
  const order = ordersById.get(job.sales_order_id);
  if (!order) return false;
  return order.fabric_lines.some((line) => line.id === job.sales_order_line_id);
}

function lineLookup(orders: SalesOrder[]): Map<string, SalesOrderFabricLine> {
  const map = new Map<string, SalesOrderFabricLine>();
  for (const order of orders) {
    for (const line of order.fabric_lines) map.set(line.id, line);
  }
  return map;
}

function patternMatchesFit(
  pattern: ClientPattern,
  fit: FitFamilyKeyParts,
  linesById: Map<string, SalesOrderFabricLine>,
  jobsByLineId: Map<string, AutoConsolidateJobInput>
): boolean {
  if (normalizeGarmentTypeFamily(pattern.garment_type) !== fit.garment_family) {
    return false;
  }

  for (const lineId of pattern.linked_fabric_line_ids ?? []) {
    const line = linesById.get(lineId);
    if (line) {
      const key = buildFitFamilyKey({
        garment_type: line.garment_type || pattern.garment_type,
        composition: line.composition,
        gsm: line.weight_gsm,
      });
      if (key === `${fit.garment_family}|${fit.composition_key}|${fit.weight_gsm}`) {
        return true;
      }
    }
    const job = jobsByLineId.get(lineId);
    if (job) {
      const key = buildFitFamilyKey(job);
      if (key === `${fit.garment_family}|${fit.composition_key}|${fit.weight_gsm}`) {
        return true;
      }
    }
  }

  for (const ref of pattern.linked_fabric_refs ?? []) {
    const key = buildFitFamilyKey({
      garment_type: pattern.garment_type,
      composition: ref.composition ?? null,
      gsm: ref.weight_gsm ?? null,
    });
    if (key === `${fit.garment_family}|${fit.composition_key}|${fit.weight_gsm}`) {
      return true;
    }
  }

  return false;
}

function scorePatternForGroup(
  pattern: ClientPattern,
  groupLineIds: Set<string>,
  groupJobPatternIds: Map<string, number>,
  fit: FitFamilyKeyParts,
  linesById: Map<string, SalesOrderFabricLine>,
  jobsByLineId: Map<string, AutoConsolidateJobInput>
): number {
  let score = 0;
  const linked = new Set(pattern.linked_fabric_line_ids ?? []);
  for (const lineId of groupLineIds) {
    if (linked.has(lineId)) score += 100;
  }
  score += (groupJobPatternIds.get(pattern.id) ?? 0) * 10;
  if (patternMatchesFit(pattern, fit, linesById, jobsByLineId)) score += 5;
  return score;
}

function pickPreferredPattern(
  clientPatterns: ClientPattern[],
  clientId: string,
  fit: FitFamilyKeyParts,
  jobs: AutoConsolidateJobInput[],
  linesById: Map<string, SalesOrderFabricLine>,
  jobsByLineId: Map<string, AutoConsolidateJobInput>
): ClientPattern | null {
  const groupLineIds = new Set(jobs.map((job) => job.sales_order_line_id));
  const groupJobPatternIds = new Map<string, number>();
  for (const job of jobs) {
    if (!job.client_pattern_id) continue;
    groupJobPatternIds.set(
      job.client_pattern_id,
      (groupJobPatternIds.get(job.client_pattern_id) ?? 0) + 1
    );
  }

  // Only reuse a pattern when it already covers this fit (linked fabric / refs)
  // or jobs in the group already point at it. Same garment alone is not enough.
  const candidates = clientPatterns.filter(
    (pattern) =>
      pattern.client_id === clientId &&
      normalizeGarmentTypeFamily(pattern.garment_type) === fit.garment_family
  );

  let best: ClientPattern | null = null;
  let bestScore = 0;
  for (const pattern of candidates) {
    const score = scorePatternForGroup(
      pattern,
      groupLineIds,
      groupJobPatternIds,
      fit,
      linesById,
      jobsByLineId
    );
    if (score <= 0) continue;
    if (!best || score > bestScore) {
      best = pattern;
      bestScore = score;
    }
  }
  return best;
}

function majorityGarmentType(jobs: AutoConsolidateJobInput[]): string {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const canonical = canonicalPatternGarmentType(job.garment_type);
    if (!canonical) continue;
    counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [garment, count] of counts) {
    if (count > bestCount) {
      best = garment;
      bestCount = count;
    }
  }
  return best || "Short";
}

function compositionDisplay(jobs: AutoConsolidateJobInput[]): string {
  const raw = jobs.find((job) => job.composition?.trim())?.composition?.trim() ?? "";
  return raw ? formatClientInvoiceComposition(raw) : "";
}

/**
 * Pure planner: group eligible jobs by (client, garment family, composition, gsm).
 * Only groups with 2+ jobs become consolidate plans.
 */
export function planAutoConsolidate(input: {
  jobs: AutoConsolidateJobInput[];
  orders: SalesOrder[];
  clientPatterns: ClientPattern[];
  sales_order_id?: string | null;
  client_id?: string | null;
}): AutoConsolidatePlan {
  const ordersById = new Map(input.orders.map((order) => [order.id, order]));
  const linesById = lineLookup(input.orders);
  const jobsByLineId = new Map(
    input.jobs.map((job) => [job.sales_order_line_id, job] as const)
  );

  let skipped_cancelled_or_orphan = 0;
  let skipped_incomplete_key = 0;

  const eligible: AutoConsolidateJobInput[] = [];
  for (const job of input.jobs) {
    if (input.sales_order_id && job.sales_order_id !== input.sales_order_id) continue;
    if (input.client_id && job.client_id !== input.client_id) continue;
    if (!isActivePatternJobForOrders(job, ordersById)) {
      skipped_cancelled_or_orphan += 1;
      continue;
    }
    if (!buildFitFamilyKey(job)) {
      skipped_incomplete_key += 1;
      continue;
    }
    eligible.push(job);
  }

  const byClientFit = new Map<string, AutoConsolidateJobInput[]>();
  for (const job of eligible) {
    const fitKey = buildFitFamilyKey(job)!;
    const key = `${job.client_id}::${fitKey}`;
    const list = byClientFit.get(key);
    if (list) list.push(job);
    else byClientFit.set(key, [job]);
  }

  const groups: AutoConsolidatePlanGroup[] = [];

  for (const [composite, jobs] of byClientFit) {
    if (jobs.length < 2) continue;
    const fitKey = composite.slice(composite.indexOf("::") + 2);
    const parsed = parseFitFamilyKey(fitKey);
    if (!parsed) continue;

    const preferred = pickPreferredPattern(
      input.clientPatterns,
      jobs[0]!.client_id,
      parsed,
      jobs,
      linesById,
      jobsByLineId
    );

    const lineIds = [...new Set(jobs.map((job) => job.sales_order_line_id))];
    const allLinkedToPreferred =
      preferred != null &&
      jobs.every((job) => job.client_pattern_id === preferred.id) &&
      lineIds.every((lineId) => (preferred.linked_fabric_line_ids ?? []).includes(lineId));

    let action: AutoConsolidatePlanGroup["action"] = "create";
    if (allLinkedToPreferred) action = "noop";
    else if (preferred) action = "link_existing";

    groups.push({
      client_id: jobs[0]!.client_id,
      client_name: jobs[0]!.client_name,
      client_code: jobs[0]!.client_code,
      fit_key: fitKey,
      garment_family: parsed.garment_family,
      garment_type: majorityGarmentType(jobs),
      composition_key: parsed.composition_key,
      composition_display: compositionDisplay(jobs),
      weight_gsm: parsed.weight_gsm,
      job_ids: jobs.map((job) => job.id),
      line_ids: lineIds,
      preferred_pattern_id: preferred?.id ?? null,
      action,
    });
  }

  groups.sort((a, b) => {
    const clientCmp = a.client_name.localeCompare(b.client_name);
    if (clientCmp !== 0) return clientCmp;
    return a.fit_key.localeCompare(b.fit_key);
  });

  // Cross-client fit families (visibility only).
  const byFit = new Map<string, AutoConsolidateJobInput[]>();
  for (const job of eligible) {
    const fitKey = buildFitFamilyKey(job)!;
    const list = byFit.get(fitKey);
    if (list) list.push(job);
    else byFit.set(fitKey, [job]);
  }

  const cross_client_fit_families: CrossClientFitFamily[] = [];
  for (const [fitKey, jobs] of byFit) {
    const parsed = parseFitFamilyKey(fitKey);
    if (!parsed) continue;
    const byClient = new Map<string, AutoConsolidateJobInput[]>();
    for (const job of jobs) {
      const list = byClient.get(job.client_id);
      if (list) list.push(job);
      else byClient.set(job.client_id, [job]);
    }
    if (byClient.size < 2) continue;

    const clients = [...byClient.values()].map((clientJobs) => ({
      client_id: clientJobs[0]!.client_id,
      client_name: clientJobs[0]!.client_name,
      client_code: clientJobs[0]!.client_code,
      job_count: clientJobs.length,
      pattern_ids: [
        ...new Set(
          clientJobs
            .map((job) => job.client_pattern_id)
            .filter((id): id is string => Boolean(id))
        ),
      ],
    }));
    clients.sort((a, b) => a.client_name.localeCompare(b.client_name));

    cross_client_fit_families.push({
      fit_key: fitKey,
      garment_family: parsed.garment_family,
      garment_type: majorityGarmentType(jobs),
      composition_key: parsed.composition_key,
      composition_display: compositionDisplay(jobs),
      weight_gsm: parsed.weight_gsm,
      clients,
    });
  }

  cross_client_fit_families.sort((a, b) => a.fit_key.localeCompare(b.fit_key));

  return {
    groups,
    cross_client_fit_families,
    skipped_incomplete_key,
    skipped_cancelled_or_orphan,
  };
}

/** Cross-client fit peers for jobs visible on one order board. */
export function fitFamiliesForJobs(
  jobs: AutoConsolidateJobInput[],
  allEligibleJobs: AutoConsolidateJobInput[],
  orders: SalesOrder[]
): CrossClientFitFamily[] {
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const eligibleAll = allEligibleJobs.filter((job) =>
    isActivePatternJobForOrders(job, ordersById)
  );
  const plan = planAutoConsolidate({
    jobs: eligibleAll,
    orders,
    clientPatterns: [],
  });
  const boardKeys = new Set(
    jobs
      .map((job) => buildFitFamilyKey(job))
      .filter((key): key is string => Boolean(key))
  );
  return plan.cross_client_fit_families.filter((family) => boardKeys.has(family.fit_key));
}
