import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { normalizeCaccioppoliItemCode } from "@/lib/integrations/caccioppoli/availability";
import { caccioppoliSwatchImageUrl as buildCaccioppoliSwatchImageUrl } from "@/lib/fabric-sourcing/caccioppoli-swatch-url";
import {
  isSupabaseCaccioppoliSwatchStorage,
  readCaccioppoliSwatchFromStorage,
} from "@/lib/fabric-sourcing/caccioppoli-swatch-storage";

export const CACCIOPPOLI_IMAGES_ROOT = path.join(process.cwd(), "data/suppliers/caccioppoli/images");
export const CACCIOPPOLI_MANIFEST_PATH = path.join(CACCIOPPOLI_IMAGES_ROOT, "manifest.json");

export type CaccioppoliSwatchManifestItem = {
  fabric_number: string;
  filename?: string;
  ok: boolean;
  bytes?: number;
  image_id?: number;
  error?: string;
};

export type CaccioppoliSwatchManifest = {
  downloaded_at?: string;
  source?: string;
  catalog_paths?: string[];
  items: CaccioppoliSwatchManifestItem[];
};

let cachedManifest: CaccioppoliSwatchManifest | null = null;
let cachedAt = 0;

export function readCaccioppoliSwatchManifest(): CaccioppoliSwatchManifest {
  const now = Date.now();
  if (cachedManifest && now - cachedAt < 5_000) return cachedManifest;
  if (!existsSync(CACCIOPPOLI_MANIFEST_PATH)) {
    cachedManifest = { items: [] };
    cachedAt = now;
    return cachedManifest;
  }
  cachedManifest = JSON.parse(readFileSync(CACCIOPPOLI_MANIFEST_PATH, "utf8")) as CaccioppoliSwatchManifest;
  cachedAt = now;
  return cachedManifest;
}

export { caccioppoliSwatchImageUrl } from "@/lib/fabric-sourcing/caccioppoli-swatch-url";

function manifestSwatchEntry(fabricNumber: string): CaccioppoliSwatchManifestItem | undefined {
  const normalized = normalizeCaccioppoliItemCode(fabricNumber);
  const manifest = readCaccioppoliSwatchManifest();
  return manifest.items.find(
    (entry) =>
      entry.ok &&
      (entry.fabric_number === fabricNumber.trim() || entry.fabric_number === normalized)
  );
}

function localSwatchFilesystemEnabled(): boolean {
  return !isSupabaseCaccioppoliSwatchStorage();
}

function swatchFileIsAvailable(filename: string): boolean {
  if (isSupabaseCaccioppoliSwatchStorage()) return false;
  return existsSync(path.join(CACCIOPPOLI_IMAGES_ROOT, filename));
}

function localSwatchFilename(fabricNumber: string): string | null {
  const entry = manifestSwatchEntry(fabricNumber);
  if (entry?.filename && swatchFileIsAvailable(entry.filename)) return entry.filename;

  const normalized = normalizeCaccioppoliItemCode(fabricNumber);
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const name = `${normalized}${ext}`;
    if (swatchFileIsAvailable(name)) return name;
  }
  return null;
}

function contentTypeForFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

export function lookupCaccioppoliSwatch(fabricNumber: string): {
  ok: boolean;
  fabric_number: string;
  requested_code: string;
  url?: string;
  bytes?: number;
} {
  const requested = fabricNumber.trim();
  const normalized = normalizeCaccioppoliItemCode(requested);
  const filename = localSwatchFilename(requested);

  if (filename) {
    const filePath = path.join(CACCIOPPOLI_IMAGES_ROOT, filename);
    return {
      ok: true,
      fabric_number: normalized,
      requested_code: requested,
      url: buildCaccioppoliSwatchImageUrl(normalized),
      bytes: existsSync(filePath) ? statSync(filePath).size : undefined,
    };
  }

  const entry = manifestSwatchEntry(requested);
  if (entry?.ok && entry.filename && isSupabaseCaccioppoliSwatchStorage()) {
    return {
      ok: true,
      fabric_number: normalized,
      requested_code: requested,
      url: buildCaccioppoliSwatchImageUrl(normalized),
    };
  }

  // Production serves bytes from Supabase. If the manifest is missing from the
  // lambda bundle (or the code is not listed yet), still expose the proxy URL so
  // the image route can try `{code}.jpg` in storage.
  if (isSupabaseCaccioppoliSwatchStorage() && normalized) {
    return {
      ok: true,
      fabric_number: normalized,
      requested_code: requested,
      url: buildCaccioppoliSwatchImageUrl(normalized),
    };
  }

  return { ok: false, fabric_number: normalized, requested_code: requested };
}

export function lookupCaccioppoliSwatches(fabricNumbers: string[]) {
  return fabricNumbers.map((code) => lookupCaccioppoliSwatch(code));
}

export function readCaccioppoliSwatchFile(fabricNumber: string): {
  buffer: Buffer;
  contentType: string;
  filename: string;
} | null {
  if (!localSwatchFilesystemEnabled()) return null;
  const filename = localSwatchFilename(fabricNumber);
  if (!filename) return null;
  const filePath = path.join(CACCIOPPOLI_IMAGES_ROOT, filename);
  if (!existsSync(filePath)) return null;
  return {
    buffer: readFileSync(filePath),
    contentType: contentTypeForFilename(filename),
    filename: path.basename(filename),
  };
}

/** Local filesystem first, then Supabase storage (production). */
export async function readCaccioppoliSwatchFileAsync(fabricNumber: string): Promise<{
  buffer: Buffer;
  contentType: string;
  filename: string;
} | null> {
  const local = readCaccioppoliSwatchFile(fabricNumber);
  if (local) return local;

  const entry = manifestSwatchEntry(fabricNumber);
  const filename =
    entry?.filename ?? `${normalizeCaccioppoliItemCode(fabricNumber)}.jpg`;

  const buffer = await readCaccioppoliSwatchFromStorage(path.basename(filename));
  if (!buffer) return null;

  return {
    buffer,
    contentType: contentTypeForFilename(filename),
    filename: path.basename(filename),
  };
}
