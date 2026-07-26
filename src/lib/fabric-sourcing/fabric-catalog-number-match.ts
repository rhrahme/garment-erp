/** True when a catalog fabric number matches user input (exact or numeric range like 66044-66046). */
export function fabricNumberMatchesCatalogEntry(input: string, catalogNumber: string): boolean {
  const normalizedInput = input.trim().toLowerCase();
  const normalizedCatalog = catalogNumber.trim().toLowerCase();
  if (!normalizedInput || !normalizedCatalog) return false;
  if (normalizedInput === normalizedCatalog) return true;

  const rangeMatch = normalizedCatalog.match(/^(\d+)-(\d+)$/);
  if (!rangeMatch) return false;

  const [, start, end] = rangeMatch;
  if (!start || !end || start.length !== end.length || normalizedInput.length !== start.length) {
    return false;
  }
  return normalizedInput >= start && normalizedInput <= end;
}
