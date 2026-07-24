import { notifyIntegration } from "@/lib/integrations";
import {
  getPatternJobByIdFresh,
  readPatternJobsFresh,
  writePatternJobs,
} from "@/lib/data/pattern-jobs";
import type {
  PatternFitting,
  PatternFittingOutcome,
  PatternJob,
  PatternJobStatus,
  PatternRevision,
  PatternRevisionFile,
} from "@/lib/types/pattern";

export async function updatePatternJob(
  jobId: string,
  patch: Partial<
    Pick<
      PatternJob,
      | "status"
      | "assigned_to"
      | "client_pattern_id"
      | "client_pattern_version_id"
      | "pattern_code"
      | "pattern_size_notes"
      | "trial_priority"
      | "blocked_reason"
      | "notes"
    >
  >,
  options: { updatedBy?: string | null; notify?: boolean } = {}
): Promise<{ ok: true; job: PatternJob } | { ok: false; status: number; error: string }> {
  const store = await readPatternJobsFresh();
  const index = store.jobs.findIndex((job) => job.id === jobId);
  if (index < 0) {
    return { ok: false, status: 404, error: "Pattern job not found." };
  }

  const existing = store.jobs[index]!;
  const now = new Date().toISOString();

  if (patch.trial_priority === true) {
    for (const job of store.jobs) {
      if (
        job.sales_order_id === existing.sales_order_id &&
        job.garment_type === existing.garment_type &&
        job.id !== jobId
      ) {
        job.trial_priority = false;
      }
    }
  }

  const previousStatus = existing.status;
  // Drop undefined entries so partial payloads (e.g. Zapier) never wipe stored fields.
  const definedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  );
  const nextJob: PatternJob = {
    ...existing,
    ...definedPatch,
    updated_at: now,
  };

  store.jobs[index] = nextJob;
  await writePatternJobs(store);

  if (options.notify !== false) {
    await notifyIntegration("pattern_job.updated", {
      id: nextJob.id,
      sales_order_id: nextJob.sales_order_id,
      so_number: nextJob.so_number,
      status: nextJob.status,
      updated_by: options.updatedBy ?? null,
    });

    if (previousStatus !== "ready_for_cutting" && nextJob.status === "ready_for_cutting") {
      await notifyIntegration("pattern_job.ready_for_cutting", {
        id: nextJob.id,
        sales_order_id: nextJob.sales_order_id,
        so_number: nextJob.so_number,
        garment_type: nextJob.garment_type,
      });
    }
  }

  return { ok: true, job: nextJob };
}

export async function addPatternFitting(
  jobId: string,
  input: {
    scheduled_at?: string | null;
    notes?: string | null;
    attendees?: string[];
  },
  options: { createdBy?: string | null } = {}
): Promise<{ ok: true; job: PatternJob; fitting: PatternFitting } | { ok: false; status: number; error: string }> {
  const store = await readPatternJobsFresh();
  const index = store.jobs.findIndex((job) => job.id === jobId);
  if (index < 0) {
    return { ok: false, status: 404, error: "Pattern job not found." };
  }

  const existing = store.jobs[index]!;
  const now = new Date().toISOString();
  const fittingNumber = existing.fittings.length + 1;
  const fitting: PatternFitting = {
    id: `pf-${Date.now()}-${fittingNumber}`,
    fitting_number: fittingNumber,
    scheduled_at: input.scheduled_at ?? null,
    completed_at: null,
    outcome: null,
    notes: input.notes ?? null,
    attendees: input.attendees ?? [],
    status: "scheduled",
    created_at: now,
    updated_at: now,
  };

  const nextJob: PatternJob = {
    ...existing,
    fittings: [...existing.fittings, fitting],
    status: existing.status === "drafting" || existing.status === "revising" ? "awaiting_fitting" : existing.status,
    updated_at: now,
  };

  store.jobs[index] = nextJob;
  await writePatternJobs(store);

  return { ok: true, job: nextJob, fitting };
}

export async function completePatternFitting(
  jobId: string,
  fittingId: string,
  input: {
    outcome: PatternFittingOutcome;
    notes?: string | null;
    attendees?: string[];
    completed_at?: string;
  },
  options: { completedBy?: string | null; notify?: boolean } = {}
): Promise<{ ok: true; job: PatternJob; fitting: PatternFitting } | { ok: false; status: number; error: string }> {
  const store = await readPatternJobsFresh();
  const index = store.jobs.findIndex((job) => job.id === jobId);
  if (index < 0) {
    return { ok: false, status: 404, error: "Pattern job not found." };
  }

  const existing = store.jobs[index]!;
  const fittingIndex = existing.fittings.findIndex((f) => f.id === fittingId);
  if (fittingIndex < 0) {
    return { ok: false, status: 404, error: "Fitting not found." };
  }

  const now = input.completed_at ?? new Date().toISOString();
  const fitting: PatternFitting = {
    ...existing.fittings[fittingIndex]!,
    outcome: input.outcome,
    notes: input.notes ?? existing.fittings[fittingIndex]!.notes,
    attendees: input.attendees ?? existing.fittings[fittingIndex]!.attendees,
    completed_at: now,
    status: input.outcome === "cancelled" ? "cancelled" : "completed",
    updated_at: now,
  };

  let nextStatus: PatternJobStatus = existing.status;
  if (input.outcome === "pass") {
    nextStatus = "ready_for_cutting";
  } else if (input.outcome === "adjust" || input.outcome === "fail") {
    nextStatus = "revising";
  } else if (input.outcome === "no_show") {
    nextStatus = "awaiting_fitting";
  }

  const nextJob: PatternJob = {
    ...existing,
    fittings: existing.fittings.map((f, i) => (i === fittingIndex ? fitting : f)),
    status: nextStatus,
    updated_at: now,
  };

  store.jobs[index] = nextJob;
  await writePatternJobs(store);

  if (options.notify !== false) {
    await notifyIntegration("pattern_fitting.completed", {
      job_id: nextJob.id,
      fitting_id: fitting.id,
      sales_order_id: nextJob.sales_order_id,
      so_number: nextJob.so_number,
      outcome: input.outcome,
      completed_by: options.completedBy ?? null,
    });
  }

  return { ok: true, job: nextJob, fitting };
}

export async function addPatternRevision(
  jobId: string,
  input: {
    changes_summary?: string | null;
    triggered_by_fitting_id?: string | null;
    revised_by?: string | null;
  },
  options: { notify?: boolean } = {}
): Promise<{ ok: true; job: PatternJob; revision: PatternRevision } | { ok: false; status: number; error: string }> {
  const store = await readPatternJobsFresh();
  const index = store.jobs.findIndex((job) => job.id === jobId);
  if (index < 0) {
    return { ok: false, status: 404, error: "Pattern job not found." };
  }

  const existing = store.jobs[index]!;
  const now = new Date().toISOString();
  const version = existing.revisions.length + 1;
  const revision: PatternRevision = {
    id: `pr-${Date.now()}-${version}`,
    version,
    triggered_by_fitting_id: input.triggered_by_fitting_id ?? null,
    changes_summary: input.changes_summary ?? null,
    revised_at: now,
    revised_by: input.revised_by ?? null,
    pattern_files: [],
  };

  const nextJob: PatternJob = {
    ...existing,
    revisions: [...existing.revisions, revision],
    status: existing.status === "revising" ? "drafting" : existing.status,
    updated_at: now,
  };

  store.jobs[index] = nextJob;
  await writePatternJobs(store);

  if (options.notify !== false) {
    await notifyIntegration("pattern_revision.created", {
      job_id: nextJob.id,
      revision_id: revision.id,
      version: revision.version,
      sales_order_id: nextJob.sales_order_id,
      so_number: nextJob.so_number,
    });
  }

  return { ok: true, job: nextJob, revision };
}

export async function attachPatternRevisionFile(
  jobId: string,
  revisionId: string,
  file: PatternRevisionFile
): Promise<{ ok: true; job: PatternJob; revision: PatternRevision } | { ok: false; status: number; error: string }> {
  const store = await readPatternJobsFresh();
  const index = store.jobs.findIndex((job) => job.id === jobId);
  if (index < 0) {
    return { ok: false, status: 404, error: "Pattern job not found." };
  }

  const existing = store.jobs[index]!;
  const revisionIndex = existing.revisions.findIndex((r) => r.id === revisionId);
  if (revisionIndex < 0) {
    return { ok: false, status: 404, error: "Revision not found." };
  }

  const revision = existing.revisions[revisionIndex]!;
  const nextRevision: PatternRevision = {
    ...revision,
    pattern_files: [...revision.pattern_files, file],
  };

  const nextJob: PatternJob = {
    ...existing,
    revisions: existing.revisions.map((r, i) => (i === revisionIndex ? nextRevision : r)),
    updated_at: new Date().toISOString(),
  };

  store.jobs[index] = nextJob;
  await writePatternJobs(store);

  return { ok: true, job: nextJob, revision: nextRevision };
}

export async function getPatternJobOrError(jobId: string) {
  const job = await getPatternJobByIdFresh(jobId);
  if (!job) return { ok: false as const, status: 404, error: "Pattern job not found." };
  return { ok: true as const, job };
}

export function isValidPatternJobStatus(value: string): value is PatternJobStatus {
  return [
    "pending",
    "assigned",
    "drafting",
    "awaiting_fitting",
    "revising",
    "ready_for_cutting",
    "completed",
    "blocked",
    "cancelled",
  ].includes(value);
}

export function isValidFittingOutcome(value: string): value is PatternFittingOutcome {
  return ["pass", "adjust", "fail", "cancelled", "no_show"].includes(value);
}
