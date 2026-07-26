/** Client-safe search helpers — do not import server data modules here. */

import { matchesNormalizedSearch } from "@/lib/search/normalize";

export function salesOrderMatchesSearch(row: { search_text: string }, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    return tokens.every((token) => matchesNormalizedSearch([row.search_text], token));
  }

  return matchesNormalizedSearch([row.search_text], trimmed);
}
