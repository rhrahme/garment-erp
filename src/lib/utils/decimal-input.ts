/** Parse a decimal string accepting dot (3.3) or comma (3,3) as the separator. */
export function parseDecimalInput(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return NaN;
  const normalized = trimmed.replace(",", ".");
  const parsed = Number(normalized);
  return parsed;
}

export function isValidPositiveDecimal(value: string): boolean {
  const parsed = parseDecimalInput(value);
  return Number.isFinite(parsed) && parsed > 0;
}

/** Normalize to dot decimal for consistent display after blur/submit. */
export function formatDecimalDisplay(value: number): string {
  return String(value);
}
