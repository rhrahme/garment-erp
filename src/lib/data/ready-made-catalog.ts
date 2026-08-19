import path from "path";
import {
  readJsonFileAsync,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import { notifyIntegration } from "@/lib/integrations";
import { deleteReadyMadeCatalogImage } from "@/lib/data/ready-made-catalog-storage";
import {
  defaultReadyMadeSizes,
  normalizeReadyMadeSize,
  readyMadeGarmentId,
} from "@/lib/ready-made/catalog-keys";
import {
  EMPTY_READY_MADE_CATALOG,
  type ReadyMadeCatalogFile,
  type ReadyMadeCatalogGarment,
  type ReadyMadeCatalogImage,
  type ReadyMadeCatalogSize,
} from "@/lib/types/ready-made-catalog";

const STORE_PATH = path.join(process.cwd(), "src/data/ready-made-catalog.json");

function emptySizes(): ReadyMadeCatalogSize[] {
  return defaultReadyMadeSizes().map((size) => ({ size, images: [] }));
}

function normalizeGarment(raw: ReadyMadeCatalogGarment): ReadyMadeCatalogGarment {
  const sizes = Array.isArray(raw.sizes) ? raw.sizes : [];
  const seen = new Set<string>();
  const merged: ReadyMadeCatalogSize[] = [];
  for (const row of [...emptySizes(), ...sizes]) {
    const size = normalizeReadyMadeSize(row.size ?? "");
    if (!size || seen.has(size)) {
      if (size && seen.has(size) && Array.isArray(row.images) && row.images.length) {
        const existing = merged.find((item) => item.size === size);
        if (existing) existing.images = [...existing.images, ...row.images];
      }
      continue;
    }
    seen.add(size);
    merged.push({
      size,
      images: Array.isArray(row.images) ? row.images : [],
    });
  }
  return {
    ...raw,
    images: Array.isArray(raw.images) ? raw.images : [],
    sizes: merged,
  };
}

function normalize(raw: ReadyMadeCatalogFile | null | undefined): ReadyMadeCatalogFile {
  return {
    updated_at: raw?.updated_at ?? null,
    garments: (Array.isArray(raw?.garments) ? raw!.garments : []).map(normalizeGarment),
  };
}

export async function readReadyMadeCatalog(): Promise<ReadyMadeCatalogFile> {
  return normalize(await readJsonFileAsync(STORE_PATH, EMPTY_READY_MADE_CATALOG));
}

export async function readReadyMadeCatalogFresh(): Promise<ReadyMadeCatalogFile> {
  return normalize(
    await readJsonFileFreshAsync(STORE_PATH, EMPTY_READY_MADE_CATALOG, { force: true })
  );
}

async function save(store: ReadyMadeCatalogFile): Promise<void> {
  store.updated_at = new Date().toISOString();
  await saveDocument(STORE_PATH, store);
}

export function findReadyMadeCatalogGarment(
  store: ReadyMadeCatalogFile,
  garmentId: string
): ReadyMadeCatalogGarment | null {
  return store.garments.find((row) => row.id === garmentId) ?? null;
}

export function findReadyMadeCatalogImage(
  garment: ReadyMadeCatalogGarment,
  imageId: string
): { image: ReadyMadeCatalogImage; size: string | null } | null {
  const garmentImage = garment.images.find((row) => row.id === imageId);
  if (garmentImage) return { image: garmentImage, size: null };
  for (const slot of garment.sizes) {
    const image = slot.images.find((row) => row.id === imageId);
    if (image) return { image, size: slot.size };
  }
  return null;
}

export async function ensureReadyMadeCatalogGarment(input: {
  brand_id: string;
  brand_label: string;
  article: string;
  garment_type: string;
}): Promise<ReadyMadeCatalogGarment> {
  const brandId = input.brand_id.trim();
  const article = input.article.trim() || "General";
  const garmentType = input.garment_type.trim() || article;
  if (!brandId) throw new Error("brand_id is required.");

  const store = await readReadyMadeCatalogFresh();
  const id = readyMadeGarmentId(brandId, article, garmentType);
  const existing = store.garments.find((row) => row.id === id);
  if (existing) return existing;

  const now = new Date().toISOString();
  const next: ReadyMadeCatalogGarment = {
    id,
    brand_id: brandId,
    brand_label: input.brand_label.trim() || brandId,
    article,
    garment_type: garmentType,
    images: [],
    sizes: emptySizes(),
    created_at: now,
    updated_at: now,
  };
  store.garments.push(next);
  await save(store);
  return next;
}

export async function addReadyMadeCatalogSize(
  garmentId: string,
  sizeRaw: string
): Promise<ReadyMadeCatalogGarment> {
  const size = normalizeReadyMadeSize(sizeRaw);
  if (!size) throw new Error("Size is required.");
  const store = await readReadyMadeCatalogFresh();
  const garment = store.garments.find((row) => row.id === garmentId);
  if (!garment) throw new Error("Garment not found.");
  if (!garment.sizes.some((row) => row.size === size)) {
    garment.sizes.push({ size, images: [] });
    garment.updated_at = new Date().toISOString();
    await save(store);
  }
  return garment;
}

export async function attachReadyMadeCatalogImage(input: {
  garment_id: string;
  size?: string | null;
  image: ReadyMadeCatalogImage;
  actor?: string | null;
}): Promise<ReadyMadeCatalogGarment> {
  const store = await readReadyMadeCatalogFresh();
  const garment = store.garments.find((row) => row.id === input.garment_id);
  if (!garment) throw new Error("Garment not found.");

  const size = input.size ? normalizeReadyMadeSize(input.size) : null;
  if (size) {
    let slot = garment.sizes.find((row) => row.size === size);
    if (!slot) {
      slot = { size, images: [] };
      garment.sizes.push(slot);
    }
    slot.images.push(input.image);
  } else {
    garment.images.push(input.image);
  }
  garment.updated_at = new Date().toISOString();
  await save(store);

  try {
    await notifyIntegration("ready_made.catalog_image_uploaded", {
      garment_id: garment.id,
      brand_id: garment.brand_id,
      article: garment.article,
      garment_type: garment.garment_type,
      size,
      image_id: input.image.id,
      uploaded_by: input.actor ?? input.image.uploaded_by,
    });
  } catch {
    /* non-fatal */
  }
  return garment;
}

export async function removeReadyMadeCatalogImage(
  garmentId: string,
  imageId: string
): Promise<ReadyMadeCatalogGarment> {
  const store = await readReadyMadeCatalogFresh();
  const garment = store.garments.find((row) => row.id === garmentId);
  if (!garment) throw new Error("Garment not found.");

  const found = findReadyMadeCatalogImage(garment, imageId);
  if (!found) throw new Error("Image not found.");

  garment.images = garment.images.filter((row) => row.id !== imageId);
  garment.sizes = garment.sizes.map((slot) => ({
    ...slot,
    images: slot.images.filter((row) => row.id !== imageId),
  }));
  garment.updated_at = new Date().toISOString();
  await save(store);

  try {
    await deleteReadyMadeCatalogImage(found.image.stored_filename);
  } catch {
    /* best-effort storage cleanup */
  }
  try {
    await notifyIntegration("ready_made.catalog_image_deleted", {
      garment_id: garment.id,
      brand_id: garment.brand_id,
      article: garment.article,
      garment_type: garment.garment_type,
      size: found.size,
      image_id: imageId,
    });
  } catch {
    /* non-fatal */
  }
  return garment;
}
