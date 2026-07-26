import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { normalizeDrapersFabricCode } from "@/lib/integrations/drapers/stock";
import {
  isSupabaseDrapersSwatchStorage,
  readDrapersSwatchFromStorage,
} from "@/lib/fabric-sourcing/drapers-swatch-storage";
import { drapersSwatchImageUrl as buildDrapersSwatchImageUrl } from "@/lib/fabric-sourcing/drapers-swatch-url";

export const DRAPERS_IMAGES_ROOT = path.join(process.cwd(), "data/suppliers/drapers/images");
export const DRAPERS_MANIFEST_PATH = path.join(DRAPERS_IMAGES_ROOT, "manifest.json");

export type DrapersSwatchManifestItem = {
  fabric_number: string;
  fabric_code?: string;
  filename?: string;
  collection?: string | null;
  ok: boolean;
  bytes?: number;
  error?: string;
};

export type DrapersSwatchManifest = {
  downloaded_at?: string;
  source?: string;
  catalog_path?: string;
  items: DrapersSwatchManifestItem[];
};

let cachedManifest: DrapersSwatchManifest | null = null;
let cachedAt = 0;

export function readDrapersSwatchManifest(): DrapersSwatchManifest {
  const now = Date.now();
  if (cachedManifest && now - cachedAt < 5_000) return cachedManifest;
  if (!existsSync(DRAPERS_MANIFEST_PATH)) {
    cachedManifest = { items: [] };
    cachedAt = now;
    return cachedManifest;
  }
  cachedManifest = JSON.parse(readFileSync(DRAPERS_MANIFEST_PATH, "utf8")) as DrapersSwatchManifest;
  cachedAt = now;
  return cachedManifest;
}

export { drapersSwatchImageUrl } from "@/lib/fabric-sourcing/drapers-swatch-url";

function manifestSwatchEntry(fabricNumber: string): DrapersSwatchManifestItem | undefined {
  const normalized = normalizeDrapersFabricCode(fabricNumber);
  const manifest = readDrapersSwatchManifest();
  return manifest.items.find(
    (entry) =>
      entry.ok &&
      (entry.fabric_number === fabricNumber.trim() ||
        entry.fabric_number === normalized ||
        entry.fabric_code === normalized)
  );
}

function localSwatchFilesystemEnabled(): boolean {
  return !isSupabaseDrapersSwatchStorage();
}

function swatchFileIsAvailable(filename: string): boolean {
  if (isSupabaseDrapersSwatchStorage()) return false;
  return existsSync(path.join(DRAPERS_IMAGES_ROOT, filename));
}

function localSwatchFilename(fabricNumber: string): string | null {
  const entry = manifestSwatchEntry(fabricNumber);
  if (!entry?.filename) return null;
  return swatchFileIsAvailable(entry.filename) ? entry.filename : null;
}

function contentTypeForFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

export function lookupDrapersSwatches(fabricNumbers: string[]) {
  return fabricNumbers.map((code) => lookupDrapersSwatch(code));
}

export function lookupDrapersSwatch(fabricNumber: string): {
  ok: boolean;
  fabric_number: string;
  requested_code: string;
  url?: string;
  bytes?: number;
} {
  const requested = fabricNumber.trim();
  const normalized = normalizeDrapersFabricCode(requested);
  const filename = localSwatchFilename(requested);

  if (filename) {
    const filePath = path.join(DRAPERS_IMAGES_ROOT, filename);
    return {
      ok: true,
      fabric_number: normalized,
      requested_code: requested,
      url: buildDrapersSwatchImageUrl(normalized),
      bytes: statSync(filePath).size,
    };
  }

  const entry = manifestSwatchEntry(requested);
  if (entry?.ok && entry.filename && isSupabaseDrapersSwatchStorage()) {
    return {
      ok: true,
      fabric_number: normalized,
      requested_code: requested,
      url: buildDrapersSwatchImageUrl(normalized),
    };
  }

  return { ok: false, fabric_number: normalized, requested_code: requested };
}

export function readDrapersSwatchFile(fabricNumber: string): {
  buffer: Buffer;
  contentType: string;
  filename: string;
} | null {
  if (!localSwatchFilesystemEnabled()) return null;
  const filename = localSwatchFilename(fabricNumber);
  if (!filename) return null;
  const filePath = path.join(DRAPERS_IMAGES_ROOT, filename);
  return {
    buffer: readFileSync(filePath),
    contentType: contentTypeForFilename(filename),
    filename: path.basename(filename),
  };
}

/** Local filesystem first, then Supabase storage (production). */
export async function readDrapersSwatchFileAsync(fabricNumber: string): Promise<{
  buffer: Buffer;
  contentType: string;
  filename: string;
} | null> {
  const local = readDrapersSwatchFile(fabricNumber);
  if (local) return local;

  const entry = manifestSwatchEntry(fabricNumber);
  const filename = entry?.filename ?? null;
  if (!filename) return null;

  const buffer = await readDrapersSwatchFromStorage(path.basename(filename));
  if (!buffer) return null;

  return {
    buffer,
    contentType: contentTypeForFilename(filename),
    filename: path.basename(filename),
  };
}
