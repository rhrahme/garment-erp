/**
 * Auto-consolidate pattern jobs by fit family (composition + gsm + garment).
 * Planning lives in auto-consolidate-grouping; this module executes writes.
 */

import { notifyIntegration } from "@/lib/integrations";
import { readPatternJobsFresh } from "@/lib/data/pattern-jobs";
import {
  ensurePatternLibraryLoaded,
  readPatternLibraryFresh,
} from "@/lib/data/pattern-library";
import { readSalesOrdersFresh } from "@/lib/data/sales-orders";
import { updatePatternJob } from "@/lib/pattern/mutations";
import {
  assignFabricLinesToClientPattern,
  createClientPattern,
} from "@/lib/pattern-library/mutations";
import {
  planAutoConsolidate,
  type AutoConsolidateOptions,
  type AutoConsolidatePlan,
  type AutoConsolidatePlanGroup,
  type AutoConsolidateResult,
} from "@/lib/pattern/auto-consolidate-grouping";

export * from "@/lib/pattern/auto-consolidate-grouping";

/**
 * Execute a plan: create/link client patterns and set job.client_pattern_id.
 * Reuses createClientPattern / assignFabricLinesToClientPattern / updatePatternJob
 * (those already notifyIntegration).
 */
export async function executeAutoConsolidatePlan(
  plan: AutoConsolidatePlan,
  options: { actedBy?: string | null; notify?: boolean } = {}
): Promise<AutoConsolidateResult> {
  let jobs_linked = 0;
  let patterns_created = 0;
  let patterns_reused = 0;
  let groups_acted = 0;
  let noop_groups = 0;
  const linked_job_ids: string[] = [];
  const created_pattern_ids: string[] = [];
  const nextGroups: AutoConsolidatePlanGroup[] = [];

  for (const group of plan.groups) {
    if (group.action === "noop") {
      noop_groups += 1;
      nextGroups.push(group);
      continue;
    }

    let patternId = group.preferred_pattern_id;

    if (group.action === "create" || !patternId) {
      const created = await createClientPattern(
        {
          client_id: group.client_id,
          client_code: group.client_code,
          client_name: group.client_name,
          garment_type: group.garment_type,
          fabric: group.composition_display || null,
          linked_fabric_line_ids: group.line_ids,
          notes: `Auto-consolidated: ${group.composition_display} ${group.weight_gsm} gsm`,
        },
        { createdBy: options.actedBy ?? null, notify: options.notify !== false }
      );
      if (!created.ok) {
        nextGroups.push({ ...group, action: "create" });
        continue;
      }
      patternId = created.pattern.id;
      patterns_created += 1;
      created_pattern_ids.push(patternId);
    } else {
      const assigned = await assignFabricLinesToClientPattern(patternId, group.line_ids, {
        assignedBy: options.actedBy ?? null,
        notify: options.notify !== false,
      });
      if (!assigned.ok) {
        nextGroups.push(group);
        continue;
      }
      patterns_reused += 1;
    }

    const jobsStore = await readPatternJobsFresh();
    for (const jobId of group.job_ids) {
      const existing = jobsStore.jobs.find((job) => job.id === jobId);
      if (!existing) continue;
      if (existing.client_pattern_id === patternId) continue;
      const updated = await updatePatternJob(
        jobId,
        { client_pattern_id: patternId },
        { updatedBy: options.actedBy ?? null, notify: options.notify !== false }
      );
      if (updated.ok) {
        jobs_linked += 1;
        linked_job_ids.push(jobId);
      }
    }

    groups_acted += 1;
    nextGroups.push({
      ...group,
      preferred_pattern_id: patternId,
      action: group.action === "create" ? "create" : "link_existing",
    });
  }

  return {
    groups_formed: plan.groups.length,
    groups_acted,
    jobs_linked,
    patterns_created,
    patterns_reused,
    noop_groups,
    skipped_incomplete_key: plan.skipped_incomplete_key,
    skipped_cancelled_or_orphan: plan.skipped_cancelled_or_orphan,
    cross_client_fit_families: plan.cross_client_fit_families,
    groups: nextGroups,
    linked_job_ids,
    created_pattern_ids,
  };
}

/** Load stores, plan, optionally execute. */
export async function runAutoConsolidate(
  options: AutoConsolidateOptions = {}
): Promise<AutoConsolidateResult> {
  await ensurePatternLibraryLoaded();
  const [jobsFile, ordersFile, library] = await Promise.all([
    readPatternJobsFresh(),
    readSalesOrdersFresh(),
    readPatternLibraryFresh(),
  ]);

  const plan = planAutoConsolidate({
    jobs: jobsFile.jobs,
    orders: ordersFile.orders,
    clientPatterns: library.client_patterns,
    sales_order_id: options.sales_order_id,
    client_id: options.client_id,
  });

  if (options.dry_run) {
    return {
      groups_formed: plan.groups.length,
      groups_acted: 0,
      jobs_linked: 0,
      patterns_created: 0,
      patterns_reused: 0,
      noop_groups: plan.groups.filter((group) => group.action === "noop").length,
      skipped_incomplete_key: plan.skipped_incomplete_key,
      skipped_cancelled_or_orphan: plan.skipped_cancelled_or_orphan,
      cross_client_fit_families: plan.cross_client_fit_families,
      groups: plan.groups,
      linked_job_ids: [],
      created_pattern_ids: [],
    };
  }

  const result = await executeAutoConsolidatePlan(plan, {
    actedBy: options.actedBy ?? null,
    notify: options.notify,
  });

  if (options.notify !== false) {
    await notifyIntegration("pattern.auto_consolidated", {
      sales_order_id: options.sales_order_id ?? null,
      client_id: options.client_id ?? null,
      groups_formed: result.groups_formed,
      groups_acted: result.groups_acted,
      jobs_linked: result.jobs_linked,
      patterns_created: result.patterns_created,
      patterns_reused: result.patterns_reused,
      linked_job_ids: result.linked_job_ids,
      created_pattern_ids: result.created_pattern_ids,
      cross_client_fit_family_count: result.cross_client_fit_families.length,
      acted_by: options.actedBy ?? null,
    });
  }

  return result;
}
