import { normalizeLoroPianaFabricNumber } from "@/lib/fabric-sourcing/loro-piana-styles";
import type { PurchaseOrderLine } from "@/lib/types/fabric-sourcing";
import type { SupplierLineUpdate } from "@/lib/integrations/supplier-reply-store";

export function normalizeFabricToken(token: string): string {
  const trimmed = token.trim().toUpperCase();
  const nsMatch = trimmed.match(/^NS(\d{4,6})$/);
  if (nsMatch) return nsMatch[1];
  const nMatch = trimmed.match(/^N(\d{4,6})$/);
  if (nMatch) return nMatch[1];
  return normalizeLoroPianaFabricNumber(token).toUpperCase();
}

function fabricTokensMatch(a: string, b: string): boolean {
  return normalizeFabricToken(a) === normalizeFabricToken(b);
}

const PERMANENT_PATTERNS = [
  /\btotally\s+out\b/i,
  /\bno\s+more\s+available\b/i,
  /\bnot\s+available\s+anymore\b/i,
  /\bcompletely\s+out\b/i,
  /\bpermanently\s+unavailable\b/i,
  /\bdiscontinued\b/i,
  /\bnon\s+pi[uù]\s+disponibil/i,
  /\besaurit[oa]\b/i,
  /\bsold\s+out\b/i,
  /\btotally\s+sold\s+out\b/i,
  /\bcompletely\s+sold\s+out\b/i,
  /\bno\s+availability\b/i,
  /\bnot\s+available\b/i,
  /\bno\s+longer\s+available\b/i,
  /\bnot\s+in\s+stock\b/i,
];

const TEMP_PATTERNS = [
  /\bavailable\s+from\b/i,
  /\bwill\s+be\s+available\b/i,
  /\bavailable\s+(?:mid|end|beginning|start)\b/i,
  /\brestock\b/i,
  /\bback\s+in\s+stock\b/i,
  /\bdispatch\s+before\b/i,
  /\bready\s+(?:from|by|on)\b/i,
  /\bfrom\s+(?:mid|end)\s+of\b/i,
];

const SUBSTITUTE_PATTERNS = [
  /\breplace(?:d|ment)?\s+with\b/i,
  /\bsubstitut(?:e|ed|ion)\b/i,
  /\binstead\s+of\b/i,
  /\buse\s+\d/i,
];

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec";

function extractRestockDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const dmy = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const monthPhrase = text.match(
    new RegExp(`\\b(?:from|mid|end|beginning|start)\\s+(?:of\\s+)?(${MONTHS})(?:\\s+(20\\d{2}))?`, "i")
  );
  if (monthPhrase) {
    const month = monthPhrase[1].toLowerCase().slice(0, 3);
    const year = monthPhrase[2] ?? String(new Date().getFullYear());
    const monthMap: Record<string, string> = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      dec: "12",
    };
    const mm = monthMap[month.slice(0, 3)];
    if (mm) {
      const day = /\bmid\b/i.test(text) ? "15" : /\bend\b/i.test(text) ? "28" : "01";
      return `${year}-${mm}-${day}`;
    }
  }

  return null;
}

function extractSubstituteFabric(text: string, currentFabric: string): string | null {
  const withMatch = text.match(/\b(?:replace(?:d|ment)?\s+with|substitut(?:e|ed|ion)|instead\s+of)\s+([A-Z]?\d[\dA-Z/-]{2,})\b/i);
  if (withMatch && !fabricTokensMatch(withMatch[1], currentFabric)) {
    return normalizeFabricToken(withMatch[1]);
  }
  return null;
}

function classifyAvailability(text: string): {
  status: SupplierLineUpdate["status"] | null;
  restock_date: string | null;
  substitute_fabric_number: string | null;
} {
  const haystack = text.replace(/\s+/g, " ").trim();
  if (!haystack) {
    return { status: null, restock_date: null, substitute_fabric_number: null };
  }

  const substitute = SUBSTITUTE_PATTERNS.some((pattern) => pattern.test(haystack));
  if (substitute) {
    return {
      status: "substituted",
      restock_date: null,
      substitute_fabric_number: extractSubstituteFabric(haystack, ""),
    };
  }

  if (TEMP_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return {
      status: "temp_unavailable",
      restock_date: extractRestockDate(haystack),
      substitute_fabric_number: null,
    };
  }

  if (PERMANENT_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return {
      status: "permanently_unavailable",
      restock_date: null,
      substitute_fabric_number: null,
    };
  }

  if (/\bout\s+of\s+stock\b/i.test(haystack) && !/\bavailable\s+from\b/i.test(haystack)) {
    return {
      status: "permanently_unavailable",
      restock_date: null,
      substitute_fabric_number: null,
    };
  }

  return { status: null, restock_date: null, substitute_fabric_number: null };
}

function lineMentionsFabric(line: string, fabricNumber: string): boolean {
  const normalizedLine = line.toUpperCase();
  const token = normalizeFabricToken(fabricNumber);
  const variants = new Set([
    token,
    `N${token}`,
    `NS${token}`,
    fabricNumber.toUpperCase(),
  ]);
  for (const variant of variants) {
    if (new RegExp(`\\b${variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalizedLine)) {
      return true;
    }
  }
  return false;
}

function contextForFabric(body: string, fabricNumber: string): string[] {
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const contexts: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!lineMentionsFabric(lines[i], fabricNumber)) continue;
    contexts.push([lines[i - 1], lines[i], lines[i + 1]].filter(Boolean).join(" "));
  }

  if (contexts.length === 0) {
    const block = body.slice(0, 4000);
    if (lineMentionsFabric(block, fabricNumber)) contexts.push(block);
  }

  return contexts;
}

function extractFabricCodesFromText(text: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /\bN\d{6}\b/gi,
    /\bNS\d{4,6}\b/gi,
    /\b\d{6}\b/g,
    /\bS\d{4,6}\b/gi,
    /\b\d{5}\/\d{3}\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      found.add(normalizeFabricToken(match[0]));
    }
  }
  return [...found];
}

export function parseAvailabilityFromEmail(
  subject: string,
  body: string,
  poLines: PurchaseOrderLine[] = []
): SupplierLineUpdate[] {
  const combined = `${subject}\n${body}`;
  const poFabrics = poLines
    .map((line) => line.fabric_number?.trim())
    .filter((value): value is string => Boolean(value));

  const mentionedInText = extractFabricCodesFromText(combined);
  const candidates = [...new Set([...poFabrics, ...mentionedInText])];

  const updates: SupplierLineUpdate[] = [];
  const listBlockPermanent =
    /\b(?:fabrics?|articles?|codes?|items?)\s+(?:totally\s+out|out\s+of\s+stock|sold\s+out|not\s+available)[\s\S]{0,400}/i.test(
      combined
    );

  for (const fabricNumber of candidates) {
    const contexts = contextForFabric(combined, fabricNumber);
    let best: SupplierLineUpdate | null = null;

    for (const context of contexts) {
      const classified = classifyAvailability(context);
      if (!classified.status || classified.status === "confirmed") continue;

      const substitute =
        classified.substitute_fabric_number ??
        extractSubstituteFabric(context, fabricNumber);

      const update: SupplierLineUpdate = {
        fabric_number: fabricNumber,
        status: classified.status,
        restock_date: classified.restock_date,
        substitute_fabric_number: substitute,
        note: context.slice(0, 280).trim() || null,
      };

      if (
        !best ||
        (best.status === "temp_unavailable" && update.status === "permanently_unavailable") ||
        (update.restock_date && !best.restock_date)
      ) {
        best = update;
      }
    }

    if (!best && listBlockPermanent && mentionedInText.some((code) => fabricTokensMatch(code, fabricNumber))) {
      const listContext = combined.match(
        new RegExp(
          `(?:totally\\s+out|no\\s+more\\s+available)[\\s\\S]{0,250}?\\b${normalizeFabricToken(fabricNumber).replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`,
          "i"
        )
      );
      if (listContext) {
        best = {
          fabric_number: fabricNumber,
          status: "permanently_unavailable",
          restock_date: null,
          substitute_fabric_number: null,
          note: listContext[0].slice(0, 280).trim(),
        };
      }
    }

    if (best && best.status !== "confirmed") {
      updates.push(best);
    }
  }

  const deduped = new Map<string, SupplierLineUpdate>();
  for (const update of updates) {
    const key = normalizeFabricToken(update.fabric_number);
    const existing = deduped.get(key);
    if (!existing || update.status === "permanently_unavailable") {
      deduped.set(key, update);
    }
  }

  return [...deduped.values()].filter(
    (update) => update.status === "temp_unavailable" || update.status === "permanently_unavailable" || update.status === "substituted"
  );
}
