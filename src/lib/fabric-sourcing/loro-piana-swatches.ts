import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { normalizeLoroPianaFabricNumber } from "@/lib/fabric-sourcing/loro-piana-styles";
import {
  isSupabaseLoroPianaSwatchStorage,
  readLoroPianaSwatchFromStorage,
} from "@/lib/fabric-sourcing/loro-piana-swatch-storage";

export { LORO_PIANA_SWATCH_SUPPLIER_ID } from "@/lib/fabric-sourcing/loro-piana-styles";
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

export function readLoroPianaSwatchManifest(): LoroPianaSwatchManifest {
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

function manifestSwatchEntry(normalized: string): LoroPianaSwatchManifestItem | undefined {
  const manifest = readLoroPianaSwatchManifest();
  return manifest.items.find((entry) => entry.fabric_number === normalized);
}

function manifestSwatchFilename(normalized: string): string | null {
  return manifestSwatchEntry(normalized)?.filename ?? null;
}

function swatchFileIsAvailable(filename: string): boolean {
  return existsSync(path.join(LORO_PIANA_IMAGES_ROOT, filename));
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

  const item = manifestSwatchEntry(normalized);
  if (item?.filename && swatchFileIsAvailable(item.filename)) {
    const filePath = path.join(LORO_PIANA_IMAGES_ROOT, item.filename);
    return {
      ok: true,
      fabric_number: normalized,
      requested_code: requested,
      url: loroPianaSwatchImageUrl(normalized),
      bytes: statSync(filePath).size,
    };
  }

  // Production stores swatch JPEGs in Supabase — the manifest is the source of truth for URLs.
  if (isSupabaseLoroPianaSwatchStorage() && item?.ok && item.filename) {
    return {
      ok: true,
      fabric_number: normalized,
      requested_code: requested,
      url: loroPianaSwatchImageUrl(normalized),
    };
  }

  return { ok: false, fabric_number: normalized, requested_code: requested };
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
