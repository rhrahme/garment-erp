/** Client-safe search helpers — do not import server data modules here. */

export function salesOrderMatchesSearch(row: { search_text: string }, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  return tokens.every((token) => row.search_text.includes(token));
}
