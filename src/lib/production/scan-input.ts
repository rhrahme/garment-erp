/** Split scanner input when two codes are typed back-to-back without Enter. */
export function splitScanInput(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const glued = trimmed.split(/(?<=-L\d{2})(?=FR-)/i).map((part) => part.trim()).filter(Boolean);
  if (glued.length > 1) return glued;

  if (/[\n\r\t,;]+/.test(trimmed)) {
    return trimmed
      .split(/[\n\r\t,;]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return [trimmed];
}

/**
 * Match shorthand fabric cut scans (FR-0101-L05) to stored codes (FR-0526-0101-L05).
 */
export function fabricCutCodesMatch(scanInput: string, fabricCutCode: string): boolean {
  const scan = scanInput.trim().toUpperCase();
  const cut = fabricCutCode.trim().toUpperCase();
  if (!scan || !cut) return false;
  if (scan === cut) return true;

  const short = scan.match(/^([A-Z]+)-(\d{4})-(L\d{2})$/);
  if (!short) return false;

  const [, brand, soNumber, linePart] = short;
  const longPattern = new RegExp(`^${brand}-\\d+-${soNumber}-${linePart}$`);
  return longPattern.test(cut);
}
