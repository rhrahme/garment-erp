import { getClientPatternByIdFresh } from "@/lib/data/pattern-library";
import {
  evaluatePatternCuttingCompleteness,
  formatCuttingCompletenessError,
} from "@/lib/pattern-library/cutting-completeness";
import { piecesForPatternJob } from "@/lib/sales-orders/label-codes";
import type { PatternJob } from "@/lib/types/pattern";

/**
 * Enforce required .TUD uploads before TUD-ready stage advances.
 * Nest inputs (width / double fold) are tracked separately for future in-ERP
 * nesting - they do not block manufacturing handoff here.
 * Marker file upload is never required.
 */
export async function assertPatternJobCuttingFiles(
  job: PatternJob,
  scope: "tud" | "nest_inputs" = "tud"
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!job.client_pattern_id) {
    return {
      ok: false,
      error: "Link a measurement sheet and upload required .TUD file(s) first.",
    };
  }

  const pattern = await getClientPatternByIdFresh(job.client_pattern_id);
  if (!pattern) {
    return { ok: false, error: "Linked client pattern not found." };
  }

  const result = evaluatePatternCuttingCompleteness(pattern, piecesForPatternJob(job));
  const message = formatCuttingCompletenessError(result, scope);
  if (message) return { ok: false, error: message };
  return { ok: true };
}
