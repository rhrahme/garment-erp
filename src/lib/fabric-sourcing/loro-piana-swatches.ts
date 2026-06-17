import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { normalizeLoroPianaFabricNumber } from "@/lib/fabric-sourcing/loro-piana-styles";
import { readLoroPianaSwatchFromStorage } from "@/lib/fabric-sourcing/loro-piana-swatch-storage";

export const LORO_PIANA_SWATCH_SUPPLIER_ID = "loro-piana";
export const LORO_PIANA_IMAGES_ROOT = path.join(process.cwd(), "data/suppliers/loro-piana/images");
export const LORO_PIANA_MANIFEST_PATH = path.join(LORO_PIANA_IMAGES_ROOT, "manifest.json");

export type LoroPianaSwatchManifestItem = {
  fabric_number: string;
  source_filename?: string;
  filename?: string;
  collection?: string | null;
  book_number?: string | null;
  weight_gsm?: number | null;
  ok: boolean;
  bytes?: number;
  error?: string;
};

export type LoroPianaSwatchManifest = {
  imported_at?: string;
  source?: string;
  catalog_path?: string;
  output_root?: string;
  items: LoroPianaSwatchManifestItem[];
};

let cachedManifest: LoroPianaSwatchManifest | null = null;
let cachedAt = 0;

function readManifest(): LoroPianaSwatchManifest {
  const now = Date.now();
  if (cachedManifest && now - cachedAt < 5_000) return cachedManifest;
  if (!existsSync(LORO_PIANA_MANIFEST_PATH)) {
    cachedManifest = { items: [] };
    cachedAt = now;
    return cachedManifest;
  }
  cachedManifest = JSON.parse(readFileSync(LORO_PIANA_MANIFEST_PATH, "utf8")) as LoroPianaSwatchManifest;
  cachedAt = now;
  return cachedManifest;
}

export function loroPianaSwatchImageUrl(fabricNumber: string): string {
  const normalized = normalizeLoroPianaFabricNumber(fabricNumber);
  return `/api/suppliers/loro-piana/images/${encodeURIComponent(normalized)}`;
}

function localSwatchFilename(normalized: string): string | null {
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const filePath = path.join(LORO_PIANA_IMAGES_ROOT, `${normalized}${ext}`);
    if (existsSync(filePath)) return `${normalized}${ext}`;
  }
  return null;
}

function manifestSwatchFilename(normalized: string): string | null {
  const manifest = readManifest();
  const item = manifest.items.find((entry) => entry.ok && entry.fabric_number === normalized);
  return item?.filename ?? null;
}

export function lookupLoroPianaSwatch(fabricNumber: string): {
  ok: boolean;
  fabric_number: string;
  requested_code: string;
  url?: string;
  bytes?: number;
} {
  const requested = fabricNumber.trim();
  const normalized = normalizeLoroPianaFabricNumber(requested);
  const manifest = readManifest();
  const item = manifest.items.find(
    (entry) => entry.ok && entry.fabric_number === normalized
  );

  if (!item?.filename) {
    const localName = localSwatchFilename(normalized);
    if (localName) {
      const filePath = path.join(LORO_PIANA_IMAGES_ROOT, localName);
      return {
        ok: true,
        fabric_number: normalized,
        requested_code: requested,
        url: loroPianaSwatchImageUrl(normalized),
        bytes: statSync(filePath).size,
      };
    }
    return { ok: false, fabric_number: normalized, requested_code: requested };
  }

  return {
    ok: true,
    fabric_number: normalized,
    requested_code: requested,
    url: loroPianaSwatchImageUrl(normalized),
    bytes: item.bytes,
  };
}

export function lookupLoroPianaSwatches(fabricNumbers: string[]) {
  return fabricNumbers.map((code) => lookupLoroPianaSwatch(code));
}

function contentTypeForFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

export function readLoroPianaSwatchFile(fabricNumber: string): {
  buffer: Buffer;
  contentType: string;
  filename: string;
} | null {
  const normalized = normalizeLoroPianaFabricNumber(fabricNumber);
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const filePath = path.join(LORO_PIANA_IMAGES_ROOT, `${normalized}${ext}`);
    if (!existsSync(filePath)) continue;
    return {
      buffer: readFileSync(filePath),
      contentType: contentTypeForFilename(`${normalized}${ext}`),
      filename: `${normalized}${ext}`,
    };
  }
  return null;
}

/** Local filesystem first, then Supabase storage (production). */
export async function readLoroPianaSwatchFileAsync(fabricNumber: string): Promise<{
  buffer: Buffer;
  contentType: string;
  filename: string;
} | null> {
  const local = readLoroPianaSwatchFile(fabricNumber);
  if (local) return local;

  const normalized = normalizeLoroPianaFabricNumber(fabricNumber);
  const filename =
    manifestSwatchFilename(normalized) ?? localSwatchFilename(normalized) ?? `${normalized}.jpg`;

  const buffer = await readLoroPianaSwatchFromStorage(filename);
  if (!buffer) return null;

  return {
    buffer,
    contentType: contentTypeForFilename(filename),
    filename,
  };
}
