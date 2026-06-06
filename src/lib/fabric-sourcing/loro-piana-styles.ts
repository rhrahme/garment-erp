/** Loro Piana supplier price list carries two fabric lines: Loro Piana (wool/cashmere) and Solbiati (mostly linen). */

export type LoroPianaMillLine = "loro_piana" | "solbiati";

export function getLoroPianaMillLine(fabricNumber: string): LoroPianaMillLine {
  return /^S/i.test(fabricNumber.trim()) ? "solbiati" : "loro_piana";
}

export function formatLoroPianaMillLineLabel(line: LoroPianaMillLine): string {
  return line === "solbiati" ? "Solbiati" : "Loro Piana";
}

/**
 * Normalize for catalog lookup.
 * - Solbiati: keep leading S (e.g. S23021)
 * - Loro Piana order codes: N781050 → 781050
 */
export function normalizeLoroPianaFabricNumber(input: string): string {
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();
  if (/^S\d+$/.test(upper)) return upper;
  const withN = upper.match(/^N(\d+)$/);
  if (withN) return withN[1]!;
  return trimmed;
}

/**
 * Build candidate fabric numbers from shorthand entry.
 * Solbiati: S + 5 digits (e.g. S23021). Users often omit the S and type 23021.
 * Loro Piana: 6 digits (book 3 + article 3), sometimes N-prefixed on orders.
 */
export function expandLoroPianaFabricNumberCandidates(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const upper = trimmed.toUpperCase();
  const out = new Set<string>([trimmed, upper]);

  if (/^S\d+$/.test(upper)) {
    out.add(upper);
    return [...out];
  }

  const nMatch = upper.match(/^N(\d+)$/);
  if (nMatch) {
    out.add(nMatch[1]!);
  }

  const digitsOnly = upper.replace(/\D/g, "");

  if (/^\d{6}$/.test(digitsOnly)) {
    out.add(digitsOnly);
  }

  if (/^\d{5}$/.test(digitsOnly)) {
    out.add(`S${digitsOnly}`);
    const book = digitsOnly.slice(0, 3);
    const article = digitsOnly.slice(3);
    out.add(`${book}${article.padStart(3, "0")}`);
  }

  if (/^\d{4}$/.test(digitsOnly)) {
    const book = digitsOnly.slice(0, 3);
    const article = digitsOnly.slice(3);
    out.add(`${book}${article.padStart(3, "0")}`);
    out.add(`S${digitsOnly}`);
  }

  return [...out];
}

/** Best number to store + which mill line it belongs to. */
export function resolveLoroPianaFabricInput(input: string): {
  candidates: string[];
  preferredNumber: string;
  millLine: LoroPianaMillLine;
} {
  const candidates = expandLoroPianaFabricNumberCandidates(input);
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();

  if (/^S\d+$/i.test(trimmed)) {
    return { candidates, preferredNumber: upper, millLine: "solbiati" };
  }

  // 5-digit shorthand without S → Solbiati (S23010). LP codes are 6 digits.
  if (/^\d{5}$/.test(trimmed)) {
    return { candidates, preferredNumber: `S${trimmed}`, millLine: "solbiati" };
  }

  const sixDigit = candidates.find((value) => /^\d{6}$/.test(value));
  if (sixDigit) {
    return { candidates, preferredNumber: sixDigit, millLine: "loro_piana" };
  }

  const solbiati = candidates.find((value) => /^S\d+$/i.test(value));
  if (solbiati) {
    return { candidates, preferredNumber: solbiati.toUpperCase(), millLine: "solbiati" };
  }

  return { candidates, preferredNumber: trimmed, millLine: getLoroPianaMillLine(trimmed) };
}

/** Expand Solbiati S23001-S23024 or Loro Piana 781038-781041 style tokens. */
export function expandLoroPianaStyleToken(token: string): string[] {
  const cleaned = token.replace(/^[A-F]\s+/, "").trim().toUpperCase();
  if (/^S\d{5,6}$/.test(cleaned)) return [cleaned];

  const solbiatiRange = cleaned.match(/^S(\d+)-S(\d+)$/);
  if (solbiatiRange) {
    const start = parseInt(solbiatiRange[1]!, 10);
    const end = parseInt(solbiatiRange[2]!, 10);
    const width = Math.max(solbiatiRange[1]!.length, solbiatiRange[2]!.length);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
    const out: string[] = [];
    for (let n = start; n <= end; n += 1) {
      out.push(`S${String(n).padStart(width, "0")}`);
    }
    return out;
  }

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

  const upper = trimmed.toUpperCase();
  if (/^S\d+$/i.test(trimmed)) return [upper];

  const solbiatiRange = upper.match(/^S(\d+)-S(\d+)$/);
  if (solbiatiRange) {
    return expandLoroPianaStyleToken(upper);
  }

  const rangeMatch = upper.match(/^N?(\d{6})-N?(\d{6})$/);
  if (rangeMatch) {
    return expandLoroPianaStyleToken(`${rangeMatch[1]}-${rangeMatch[2]}`);
  }

  return expandLoroPianaFabricNumberCandidates(trimmed);
}
