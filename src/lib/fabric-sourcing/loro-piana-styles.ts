/** Loro Piana supplier price list carries two fabric lines: Loro Piana (wool/cashmere) and Solbiati (mostly linen). */

export type LoroPianaMillLine = "loro_piana" | "solbiati";

export const LORO_PIANA_STYLE_SUPPLIER_IDS = ["loro-piana", "solbiati"] as const;

export function isLoroPianaStyleSupplier(supplierId: string): boolean {
  return (LORO_PIANA_STYLE_SUPPLIER_IDS as readonly string[]).includes(supplierId);
}

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
  // ClickUp Solbiati linen: NS25016 (N prefix + S + 5 digits)
  if (/^NS/i.test(upper)) return normalizeSolbiatiFabricNumber(upper.slice(1));
  if (/^S\d+$/.test(upper)) return normalizeSolbiatiFabricNumber(upper);
  const withN = upper.match(/^N(\d+)$/);
  if (withN) return withN[1]!;
  return trimmed;
}

/** Solbiati linen codes are S + 5 digits (e.g. S25016). Correct common S250016-style typos. */
export function normalizeSolbiatiFabricNumber(fabricNumber: string): string {
  const upper = fabricNumber.trim().toUpperCase();
  if (!/^S\d+$/.test(upper)) return upper;
  const solbiatiTypo = upper.match(/^S(\d{2})0(\d{3})$/);
  if (solbiatiTypo) return `S${solbiatiTypo[1]}${solbiatiTypo[2]}`;
  return upper;
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
    const normalized = normalizeSolbiatiFabricNumber(upper);
    out.add(normalized);
    if (normalized !== upper) out.add(upper);
    return [...out];
  }

  if (/^NS/i.test(upper)) {
    const withoutN = upper.slice(1);
    if (/^S\d+$/.test(withoutN)) {
      const normalized = normalizeSolbiatiFabricNumber(withoutN);
      out.add(normalized);
      out.add(upper);
      out.add(withoutN);
      if (normalized !== withoutN) out.add(withoutN);
      return [...out];
    }
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
    const preferredNumber = normalizeSolbiatiFabricNumber(upper);
    return { candidates, preferredNumber, millLine: "solbiati" };
  }

  if (/^NS/i.test(upper)) {
    const preferredNumber = normalizeSolbiatiFabricNumber(upper.slice(1));
    return { candidates, preferredNumber, millLine: "solbiati" };
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
  if (/^S\d+$/i.test(trimmed)) return [normalizeSolbiatiFabricNumber(upper)];
  if (/^NS/i.test(upper)) return [normalizeSolbiatiFabricNumber(upper.slice(1))];

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
