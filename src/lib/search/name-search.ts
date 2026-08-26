import { matchesNormalizedSearch, normalizeSearchText } from "@/lib/search/normalize";

function hamming(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let dist = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) dist += 1;
  }
  return dist;
}

/**
 * Client-name search. "ibi" must find Ibrahim (I-b-r-a-h-i-m has no "ibi"
 * substring). Allow a one-letter slip on a first/last-name prefix.
 */
export function matchesLooseName(
  name: string | null | undefined,
  query: string
): boolean {
  if (matchesNormalizedSearch([name], query)) return true;
  const q = normalizeSearchText(query);
  if (!q) return true;
  const words = String(name ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  for (const word of words) {
    const normalized = normalizeSearchText(word);
    if (!normalized) continue;
    if (normalized.startsWith(q)) return true;
    if (q.length >= 3 && normalized.length >= q.length) {
      if (hamming(normalized.slice(0, q.length), q) <= 1) return true;
    }
  }
  return false;
}
