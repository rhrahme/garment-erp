import { formatDecimalDisplay, parseDecimalInput } from "@/lib/utils/decimal-input";

export type FabricWidthFields = {
  width_cm?: number | null;
  width_inches?: number | null;
};

export type PreviousMetersLine = FabricWidthFields & {
  garment_type: string;
  /** Draft form meters string (SalesOrderForm). */
  meters?: string | null;
  /** Persisted order quantity (SalesOrderFabricLine). */
  quantity?: number | null;
  lineId?: string;
  id?: string;
};

/** True when both sides have a known width that matches (cm preferred, else inches). */
export function fabricWidthsMatch(a: FabricWidthFields, b: FabricWidthFields): boolean {
  if (a.width_cm != null && b.width_cm != null) {
    return a.width_cm === b.width_cm;
  }
  if (a.width_inches != null && b.width_inches != null) {
    return a.width_inches === b.width_inches;
  }
  return false;
}

function lineMetersValue(line: PreviousMetersLine): number | null {
  if (line.meters != null && String(line.meters).trim() !== "") {
    const parsed = parseDecimalInput(String(line.meters));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (line.quantity != null && Number.isFinite(line.quantity) && line.quantity > 0) {
    return line.quantity;
  }
  return null;
}

function lineIdentity(line: PreviousMetersLine): string | null {
  return line.lineId ?? line.id ?? null;
}

/**
 * Most recent prior line with the same garment type + fabric width that has meters filled.
 * Walks from the end of `priorLines` (newest first).
 */
export function findPreviousMeters(
  priorLines: PreviousMetersLine[],
  opts: {
    garmentType: string;
    width: FabricWidthFields;
    /** Skip the line currently being edited. */
    excludeLineId?: string | null;
  }
): string | null {
  const garmentType = opts.garmentType.trim();
  if (!garmentType) return null;

  for (let i = priorLines.length - 1; i >= 0; i -= 1) {
    const line = priorLines[i]!;
    if (opts.excludeLineId) {
      const id = lineIdentity(line);
      if (id && id === opts.excludeLineId) continue;
    }
    if (line.garment_type !== garmentType) continue;
    if (!fabricWidthsMatch(line, opts.width)) continue;
    const meters = lineMetersValue(line);
    if (meters == null) continue;
    return formatDecimalDisplay(meters);
  }

  return null;
}

/** Prefill empty meters from a prior match; never overwrites user-entered values. */
export function suggestMetersIfEmpty(
  currentMeters: string,
  previousMeters: string | null
): string {
  if (!previousMeters) return currentMeters;
  if (currentMeters.trim() !== "") return currentMeters;
  return previousMeters;
}
