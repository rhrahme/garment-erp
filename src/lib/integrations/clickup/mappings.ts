import type { GarmentStitchType } from "../../sales-orders/garment-types";

/** ClickUp Brands dropdown → ERP factory brand id */
export function mapClickUpBrand(brand: string | null): string | null {
  if (!brand) return null;
  const key = brand.trim().toUpperCase();
  const map: Record<string, string> = {
    FR: "fouad-rahme",
    FD: "fouad",
    JU: "just-uniforms",
    G: "gliani",
    GLIANI: "gliani",
    GL: "gliani",
  };
  return map[key] ?? null;
}

/** ClickUp Fabric Brand → ERP supplier id */
export function mapClickUpSupplier(fabricBrand: string | null): { id: string; name: string } | null {
  if (!fabricBrand) return null;
  const normalized = fabricBrand.trim().toLowerCase();
  const map: Record<string, { id: string; name: string }> = {
    caccioppoli: { id: "caccioppoli", name: "Caccioppoli" },
    zegna: { id: "zegna", name: "Zegna" },
    drapers: { id: "drapers", name: "Drapers" },
    stylbiella: { id: "stylbiella", name: "Stylbiella" },
    "loro piana": { id: "loro-piana", name: "Loro Piana" },
    solbiati: { id: "solbiati", name: "Solbiati" },
    stock: { id: "canclini", name: "Canclini" },
    gl: { id: "canclini", name: "Canclini" },
    canclini: { id: "canclini", name: "Canclini" },
    wool: { id: "wool-stock", name: "Wool Stock" },
    "wool-stock": { id: "wool-stock", name: "Wool Stock" },
  };
  return map[normalized] ?? { id: normalized.replace(/\s+/g, "-"), name: fabricBrand.trim() };
}

/** ClickUp Item field → ERP garment stitch type */
export function mapClickUpItemToGarmentType(item: string | null): string {
  if (!item) return "Trouser";
  const normalized = item.trim().toLowerCase();

  const exact: Record<string, GarmentStitchType | string> = {
    "trouser suit (fr)": "Suit",
    "blazer suit (fr)": "Suit",
    "suits (g)": "Suit",
    "suits (ju)": "Suit",
    "suit + vest sets (g)": "Suit",
    "blazers (fr)": "Jacket",
    "blazers (g)": "Jacket",
    "blazers (ju)": "Jacket",
    "trousers (fr)": "Trouser",
    "trousers (g)": "Trouser",
    "trousers (ju)": "Trouser",
    "shorts (fr)": "Short",
    "shorts (gl)": "Short",
    "jersy fabric short (fr)": "Short",
    "overshirts (fr)": "Overshirt",
    "over shirt (g)": "Overshirt",
    "over shirt + trouser (fr)": "Overshirt+Trouser",
    "shirts (fr)": "Shirt LS",
    "shirts (g)": "Shirt LS",
    "shirts (ju)": "Shirt LS",
    "short sleeve shirt (fr)": "Shirt SS",
    "shirt + trouser (fr)": "Shirt+Trouser",
    "shirt + trouser + short sets (fr)": "Shirt+Trouser",
    "shirt + short sets (fr)": "Shirt+Short",
    "trouser + shirt (fr)": "Shirt+Trouser",
    "overcoats (fr)": "Overcoat",
    "overcoats (g)": "Overcoat",
  };

  if (exact[normalized]) return exact[normalized];

  if (normalized.includes("suit")) return "Suit";
  if (normalized.includes("blazer") || normalized.includes("jacket")) return "Jacket";
  if (normalized.includes("trouser")) return "Trouser";
  if (normalized.includes("short")) return "Short";
  if (normalized.includes("overshirt") || normalized.includes("over shirt")) return "Overshirt";
  if (normalized.includes("shirt")) return "Shirt LS";
  if (normalized.includes("overcoat")) return "Overcoat";
  if (normalized.includes("thobe") || normalized.includes("serwal") || normalized.includes("balto")) return "Trouser";

  return item.replace(/\s*\([^)]*\)\s*$/, "").trim() || "Trouser";
}

export function isGroupOrderName(name: string): boolean {
  return /\bgroup\b/i.test(name);
}

export function normalizeFabricNumber(raw: string | null): string {
  if (!raw) return "";
  return raw.trim().replace(/^N/i, "");
}
