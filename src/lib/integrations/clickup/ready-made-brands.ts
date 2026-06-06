export type ReadyMadeBrandId =
  | "massimo-dutti"
  | "suit-supply"
  | "boggi"
  | "cafe-cotton"
  | "zegna"
  | "blue-mint"
  | "lebanon-beirut"
  | "luca-faloni";

export interface ReadyMadeBrandDefinition {
  id: ReadyMadeBrandId;
  label: string;
  /** Longest aliases first for prefix matching */
  aliases: string[];
  client_code: string;
}

export const READY_MADE_BRANDS: ReadyMadeBrandDefinition[] = [
  {
    id: "massimo-dutti",
    label: "Massimo Dutti",
    aliases: ["massimo dutti", "massimo"],
    client_code: "RM-MD",
  },
  {
    id: "suit-supply",
    label: "Suit Supply",
    aliases: ["suit supply"],
    client_code: "RM-SS",
  },
  {
    id: "boggi",
    label: "Boggi",
    aliases: ["boggi", "boggy"],
    client_code: "RM-BO",
  },
  {
    id: "cafe-cotton",
    label: "Cafe Cotton",
    aliases: ["cafe cotton"],
    client_code: "RM-CC",
  },
  {
    id: "zegna",
    label: "Zegna",
    aliases: ["zegna"],
    client_code: "RM-ZG",
  },
  {
    id: "blue-mint",
    label: "Blue Mint",
    aliases: ["blue mint"],
    client_code: "RM-BM",
  },
  {
    id: "lebanon-beirut",
    label: "Lebanon Beirut",
    aliases: ["lebanon beirut"],
    client_code: "RM-LB",
  },
  {
    id: "luca-faloni",
    label: "Luca Faloni",
    aliases: ["luca faloni"],
    client_code: "RM-LF",
  },
];

export interface ParsedReadyMadeRoot {
  brand: ReadyMadeBrandDefinition;
  /** Garment/article label from the ClickUp task name, e.g. "Linen Short" */
  article: string;
}

function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Strip factory prefix from ClickUp task names, e.g. "FR Suit Supply …" → "suit supply …". */
function stripFactoryPrefix(normalized: string): string {
  return normalized
    .replace(/^(fr|gl|fd|ju|g)\s+/, "")
    .replace(/^\((fr|gl|fd|ju|g)\)\s+/, "")
    .trim();
}

export function matchReadyMadeBrand(taskName: string): ReadyMadeBrandDefinition | null {
  const normalized = stripFactoryPrefix(normalizeForMatch(taskName));

  if (/\bcomfort suits\b/.test(normalized)) {
    return READY_MADE_BRANDS.find((brand) => brand.id === "suit-supply") ?? null;
  }

  for (const brand of READY_MADE_BRANDS) {
    for (const alias of brand.aliases) {
      if (normalized.startsWith(alias)) return brand;
    }
  }
  return null;
}

export function parseReadyMadeRoot(taskName: string): ParsedReadyMadeRoot | null {
  const brand = matchReadyMadeBrand(taskName);
  if (!brand) return null;

  const normalized = stripFactoryPrefix(normalizeForMatch(taskName));

  if (brand.id === "suit-supply" && /\bcomfort suits\b/.test(normalized)) {
    return { brand, article: "Comfort Suits Set" };
  }

  let articleNorm = normalized;
  for (const alias of brand.aliases) {
    const aliasNorm = normalizeForMatch(alias);
    if (articleNorm.startsWith(aliasNorm)) {
      articleNorm = articleNorm.slice(aliasNorm.length).trim();
      break;
    }
  }

  const article = articleNorm ? titleCaseArticle(articleNorm) : "General";
  return { brand, article };
}

function titleCaseArticle(article: string): string {
  return article
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "group") return "Group";
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function readyMadeGroupKey(taskName: string): string | null {
  const parsed = parseReadyMadeRoot(taskName);
  if (!parsed) return null;
  return `${parsed.brand.id}::${normalizeForMatch(parsed.article)}`;
}

export function retailBrandClientId(brandId: ReadyMadeBrandId): string {
  return `cu-retail-${brandId}`;
}
