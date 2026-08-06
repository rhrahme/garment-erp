import { readPatternLibrary } from "@/lib/data/pattern-library";
import type { PatternAlterationPendingItem } from "@/lib/types/pattern-alteration-pending";
import type { ClientPattern, ClientPatternVersion } from "@/lib/types/pattern-library";

/** Prefer the newest trial/sample version for stitcher-sheet comments. */
export function preferredClientPatternVersion(
  pattern: ClientPattern
): ClientPatternVersion | null {
  if (pattern.versions.length === 0) return null;
  if (pattern.final_version_id) {
    const final = pattern.versions.find((row) => row.id === pattern.final_version_id);
    if (final) return final;
  }
  return [...pattern.versions].sort((a, b) => {
    const aAt = a.updated_at || a.trial_date || "";
    const bAt = b.updated_at || b.trial_date || "";
    return bAt.localeCompare(aAt);
  })[0]!;
}

/**
 * Find the client pattern Pattern should comment on for this alteration:
 * linked fabric line first, then client + garment type.
 */
export function resolveClientPatternForAlteration(
  item: Pick<
    PatternAlterationPendingItem,
    "client_id" | "garment_type" | "related_articles" | "client_pattern_id"
  >
): ClientPattern | null {
  const store = readPatternLibrary();
  if (item.client_pattern_id) {
    const byId = store.client_patterns.find((row) => row.id === item.client_pattern_id);
    if (byId) return byId;
  }

  const lineIds = new Set(
    item.related_articles
      .map((row) => row.sales_order_line_id?.trim())
      .filter((id): id is string => Boolean(id))
  );

  if (lineIds.size > 0) {
    const byLine = store.client_patterns.find((pattern) =>
      (pattern.linked_fabric_line_ids ?? []).some((id) => lineIds.has(id))
    );
    if (byLine) return byLine;
  }

  const clientId = item.client_id?.trim();
  if (!clientId) return null;

  const garment = item.garment_type?.trim().toLowerCase() ?? "";
  const forClient = store.client_patterns.filter((pattern) => pattern.client_id === clientId);
  if (forClient.length === 0) return null;
  if (!garment) return forClient[0] ?? null;

  const exact = forClient.find(
    (pattern) => pattern.garment_type.trim().toLowerCase() === garment
  );
  if (exact) return exact;

  const pieceHint = garment.split("+")[0]?.trim() ?? garment;
  return (
    forClient.find((pattern) =>
      pattern.garment_type.trim().toLowerCase().includes(pieceHint)
    ) ?? forClient[0] ??
    null
  );
}

/** Merge Pattern stitcher comments into sheet special_instructions without duplicating blocks. */
export function mergeAlterationStitcherComments(
  existing: string | null | undefined,
  productionCode: string,
  comments: string
): string {
  const marker = `[Alteration ${productionCode}]`;
  const body = comments.trim();
  const block = body ? `${marker} ${body}` : "";
  const current = String(existing ?? "").trim();
  if (!current) return block;

  const lines = current.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const kept = lines.filter((line) => !line.startsWith(marker));
  if (block) kept.push(block);
  return kept.join("\n");
}
