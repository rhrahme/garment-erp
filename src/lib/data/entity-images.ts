import path from "path";
import {
  readJsonFileAsync,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import { deleteEntityImageFile } from "@/lib/data/entity-images-storage";
import { notifyIntegration } from "@/lib/integrations";
import { isValidEntityKey, parseEntityKey } from "@/lib/entity-images/keys";
import {
  EMPTY_ENTITY_IMAGES,
  type EntityImage,
  type EntityImageAlbum,
  type EntityImagesFile,
} from "@/lib/types/entity-images";

const STORE_PATH = path.join(process.cwd(), "src/data/entity-images.json");

function normalizeAlbum(raw: EntityImageAlbum): EntityImageAlbum | null {
  const parsed = parseEntityKey(raw.key);
  if (!parsed) return null;
  return {
    key: parsed.key,
    kind: parsed.kind,
    label: String(raw.label ?? "").trim() || parsed.key,
    images: Array.isArray(raw.images) ? raw.images : [],
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

function normalize(raw: EntityImagesFile | null | undefined): EntityImagesFile {
  const albums = (Array.isArray(raw?.albums) ? raw!.albums : [])
    .map(normalizeAlbum)
    .filter((row): row is EntityImageAlbum => Boolean(row));
  return {
    updated_at: raw?.updated_at ?? null,
    albums,
  };
}

export async function readEntityImages(): Promise<EntityImagesFile> {
  return normalize(await readJsonFileAsync(STORE_PATH, EMPTY_ENTITY_IMAGES));
}

export async function readEntityImagesFresh(): Promise<EntityImagesFile> {
  return normalize(
    await readJsonFileFreshAsync(STORE_PATH, EMPTY_ENTITY_IMAGES, { force: true })
  );
}

async function save(store: EntityImagesFile): Promise<void> {
  store.updated_at = new Date().toISOString();
  await saveDocument(STORE_PATH, store);
}

export function findEntityAlbum(
  store: EntityImagesFile,
  albumKey: string
): EntityImageAlbum | null {
  const parsed = parseEntityKey(albumKey);
  if (!parsed) return null;
  return store.albums.find((row) => row.key === parsed.key) ?? null;
}

export function findEntityImage(
  album: EntityImageAlbum,
  imageId: string
): EntityImage | null {
  return album.images.find((row) => row.id === imageId) ?? null;
}

export function listEntityAlbums(
  store: EntityImagesFile,
  keys: string[]
): EntityImageAlbum[] {
  const seen = new Set<string>();
  const albums: EntityImageAlbum[] = [];
  for (const key of keys) {
    const album = findEntityAlbum(store, key);
    if (!album || seen.has(album.key)) continue;
    seen.add(album.key);
    albums.push(album);
  }
  return albums;
}

export async function attachEntityImage(input: {
  key: string;
  label?: string | null;
  image: EntityImage;
  actor?: string | null;
}): Promise<EntityImageAlbum> {
  const parsed = parseEntityKey(input.key);
  if (!parsed) throw new Error("Invalid album key.");

  const store = await readEntityImagesFresh();
  const now = new Date().toISOString();
  let album = store.albums.find((row) => row.key === parsed.key);
  if (!album) {
    album = {
      key: parsed.key,
      kind: parsed.kind,
      label: String(input.label ?? "").trim() || parsed.key,
      images: [],
      created_at: now,
      updated_at: now,
    };
    store.albums.push(album);
  } else if (input.label?.trim() && !album.label) {
    album.label = input.label.trim();
  }
  album.images.push(input.image);
  album.updated_at = now;
  await save(store);

  try {
    await notifyIntegration("entity.image_uploaded", {
      album_key: album.key,
      kind: album.kind,
      label: album.label,
      image_id: input.image.id,
      uploaded_by: input.actor ?? input.image.uploaded_by,
    });
  } catch {
    /* non-fatal */
  }
  return album;
}

export async function removeEntityImage(
  albumKey: string,
  imageId: string
): Promise<EntityImageAlbum> {
  if (!isValidEntityKey(albumKey)) throw new Error("Invalid album key.");
  const store = await readEntityImagesFresh();
  const album = findEntityAlbum(store, albumKey);
  if (!album) throw new Error("Album not found.");
  const image = findEntityImage(album, imageId);
  if (!image) throw new Error("Image not found.");

  album.images = album.images.filter((row) => row.id !== imageId);
  album.updated_at = new Date().toISOString();
  await save(store);

  try {
    await deleteEntityImageFile(image.stored_filename);
  } catch {
    /* best-effort storage cleanup */
  }
  try {
    await notifyIntegration("entity.image_deleted", {
      album_key: album.key,
      kind: album.kind,
      label: album.label,
      image_id: imageId,
    });
  } catch {
    /* non-fatal */
  }
  return album;
}
