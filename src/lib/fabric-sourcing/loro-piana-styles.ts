/** Loro Piana order codes often prefix book fabrics with N, e.g. N781050 → 781050. */
export function normalizeLoroPianaFabricNumber(input: string): string {
  const trimmed = input.trim();
  const withN = trimmed.toUpperCase().match(/^N(\d{6})$/);
  if (withN) return withN[1];
  return trimmed;
}

/** Expand Loro Piana style tokens like 781038-781041 into individual fabric numbers. */
export function expandLoroPianaStyleToken(token: string): string[] {
  const cleaned = token.replace(/^[A-F]\s+/, "").trim();
  const normalized = normalizeLoroPianaFabricNumber(cleaned);
  const match = normalized.match(/^(\d{6})(?:-(\d{6}))?$/);
  if (!match) return [];

  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : start;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];

  const out: string[] = [];
  for (let n = start; n <= end; n += 1) {
    out.push(String(n));
  }
  return out;
}

export function expandLoroPianaStyleQuery(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const rangeMatch = trimmed.toUpperCase().match(/^N?(\d{6})-N?(\d{6})$/);
  if (rangeMatch) {
    return expandLoroPianaStyleToken(`${rangeMatch[1]}-${rangeMatch[2]}`);
  }

  return [normalizeLoroPianaFabricNumber(trimmed)];
}
