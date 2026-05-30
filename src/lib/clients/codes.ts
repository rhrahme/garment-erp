import type { ClientProfile } from "@/lib/types/clients";

/** Client code prefix per production brand */
export const BRAND_CLIENT_CODE_PREFIX: Record<string, string> = {
  gliani: "GL",
  "fouad-rahme": "FR",
  fouad: "FD",
  "just-uniforms": "JU",
};

export function getBrandClientCodePrefix(brandId: string): string | null {
  return BRAND_CLIENT_CODE_PREFIX[brandId] ?? null;
}

/** Month + year when client joined, e.g. May 2026 → "0526" */
export function getJoinMonthYear(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${month}${year}`;
}

export function formatClientCode(prefix: string, mmyy: string, sequence: number): string {
  return `${prefix}-${mmyy}-${String(sequence).padStart(4, "0")}`;
}

export function parseClientCodeParts(
  code: string
): { prefix: string; mmyy: string; sequence: number } | null {
  const match = code.match(/^([A-Z]{2})-(\d{4})-(\d{4})$/);
  if (!match) return null;
  return {
    prefix: match[1],
    mmyy: match[2],
    sequence: Number.parseInt(match[3], 10),
  };
}

type GenerateClientCodeOptions = {
  excludeClientId?: string;
  /** Join date — defaults to now. Month/year in code comes from this. */
  joinedAt?: Date;
};

/** Next unique code, e.g. GL-0526-0008 (brand · month/year joined · running sequence for brand) */
export function generateNextClientCode(
  clients: ClientProfile[],
  brandId: string,
  options: GenerateClientCodeOptions = {}
): string | null {
  const prefix = getBrandClientCodePrefix(brandId);
  if (!prefix) return null;

  const joinedAt = options.joinedAt ?? new Date();
  const mmyy = getJoinMonthYear(joinedAt);

  let max = 0;
  for (const client of clients) {
    if (options.excludeClientId && client.id === options.excludeClientId) continue;
    const parts = parseClientCodeParts(client.code);
    if (parts && parts.prefix === prefix && parts.sequence > max) {
      max = parts.sequence;
    }
  }

  return formatClientCode(prefix, mmyy, max + 1);
}

export function isAutoClientCode(code: string): boolean {
  return parseClientCodeParts(code) !== null;
}

export function formatJoinMonthYearLabel(mmyy: string): string {
  const month = Number.parseInt(mmyy.slice(0, 2), 10);
  const year = Number.parseInt(mmyy.slice(2, 4), 10);
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  if (month < 1 || month > 12) return mmyy;
  return `${monthNames[month - 1]} 20${String(year).padStart(2, "0")}`;
}
