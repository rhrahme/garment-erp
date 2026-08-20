/**
 * Create / assign fabric grouping must only link sales-order lines that still
 * exist for the client. Pattern jobs can outlive a deleted or transferred
 * fabric line; those leftover ids must not 400 the whole consolidate.
 */

export type PartitionLinkedFabricLineIdsResult = {
  linked: string[];
  skippedOrphans: string[];
  unknown: string[];
};

export function partitionLinkedFabricLineIds(input: {
  requested: string[];
  validLineIds: Set<string>;
  orphanLineIds: Set<string>;
}): PartitionLinkedFabricLineIdsResult {
  const linked: string[] = [];
  const skippedOrphans: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();

  for (const raw of input.requested) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (input.validLineIds.has(id)) linked.push(id);
    else if (input.orphanLineIds.has(id)) skippedOrphans.push(id);
    else unknown.push(id);
  }

  return { linked, skippedOrphans, unknown };
}

export function orphanLineIdsForClient(
  clientId: string,
  jobs: Array<{
    client_id?: string | null;
    status?: string | null;
    sales_order_line_id?: string | null;
  }>,
  validLineIds: Set<string>
): Set<string> {
  const orphans = new Set<string>();
  for (const job of jobs) {
    if (job.client_id !== clientId) continue;
    if (job.status === "cancelled") continue;
    const id = job.sales_order_line_id?.trim();
    if (id && !validLineIds.has(id)) orphans.add(id);
  }
  return orphans;
}

export function missingClientFabricLinesError(unknown: string[]): string {
  return `Fabric line(s) not found on this client's sales orders: ${unknown.join(", ")}.`;
}

export function allRequestedLinesRemovedFromOrdersError(): string {
  return "None of the selected fabrics are still on this client's sales orders. Tick only fabrics that are still on the order. If a fabric was removed or transferred, ask QC to put it back first.";
}
