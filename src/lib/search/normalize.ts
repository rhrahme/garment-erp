/**
 * Client-safe search normalization helpers.
 *
 * Users type codes with inconsistent separators — `FR-0726-0039`,
 * `FR-07260039`, `fr 0726 0039`, `07260039` should all find the same record.
 * Normalizing strips every non-alphanumeric separator (dashes, spaces,
 * slashes, punctuation) and lowercases so comparison ignores formatting.
 */

/** Strip non-alphanumeric separators and lowercase (keeps unicode letters/digits). */
export function normalizeSearchText(value: string | null | undefined): string {
  if (!value) return "";
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * True when any searchable field contains the query after both sides are
 * normalized. Strictly more forgiving than a raw substring match: an empty or
 * separator-only query matches everything.
 */
export function matchesNormalizedSearch(
  fields: Array<string | null | undefined>,
  query: string
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return fields.some((field) => normalizeSearchText(field).includes(normalizedQuery));
}
