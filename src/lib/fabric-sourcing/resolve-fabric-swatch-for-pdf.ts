import sharp from "sharp";
import {
  isCaccioppoliSwatchSupplier,
  isDrapersSwatchSupplier,
  isLoroPianaSwatchSupplier,
  type FabricSwatchKey,
} from "@/lib/fabric-sourcing/fabric-swatch-keys";
import { readLoroPianaSwatchFileAsync } from "@/lib/fabric-sourcing/loro-piana-swatches";
import { lookupCaccioppoliItemImages } from "@/lib/integrations/caccioppoli/client";
import { isCaccioppoliApiConfigured } from "@/lib/integrations/caccioppoli/config";
import { lookupDrapersFabricMedias } from "@/lib/integrations/drapers/client";
import { isDrapersApiConfigured } from "@/lib/integrations/drapers/config";
import { getDrapersCatalogSwatchUrls } from "@/lib/integrations/drapers/drapers-catalog-swatches";

const SWATCH_PX = 80;

function swatchCacheKey(supplierId: string, fabricNumber: string): string {
  return `${supplierId}\0${fabricNumber.trim()}`;
}

/** Normalize any image source to a JPEG data URL for jsPDF embed. */
async function toJpegDataUrl(source: Buffer | string): Promise<string | null> {
  try {
    let buffer: Buffer;
    if (typeof source === "string") {
      if (source.startsWith("data:")) {
        const base64 = source.split(",")[1];
        if (!base64) return null;
        buffer = Buffer.from(base64, "base64");
      } else {
        const res = await fetch(source, { cache: "no-store" });
        if (!res.ok) return null;
        buffer = Buffer.from(await res.arrayBuffer());
      }
    } else {
      buffer = source;
    }

    const jpeg = await sharp(buffer)
      .rotate()
      .resize(SWATCH_PX, SWATCH_PX, { fit: "cover" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

async function loadLoroPianaSwatchJpeg(fabricNumber: string): Promise<string | null> {
  const file = await readLoroPianaSwatchFileAsync(fabricNumber);
  if (!file) return null;
  return toJpegDataUrl(file.buffer);
}

async function loadDrapersSwatchJpeg(fabricNumber: string): Promise<string | null> {
  const cached = getDrapersCatalogSwatchUrls(fabricNumber);
  if (cached?.square) {
    const jpeg = await toJpegDataUrl(cached.square);
    if (jpeg) return jpeg;
  }

  if (!isDrapersApiConfigured()) return null;
  const result = await lookupDrapersFabricMedias(fabricNumber);
  if (!result.ok || !result.medias.square) return null;
  return toJpegDataUrl(result.medias.square);
}

async function loadCaccioppoliSwatchJpeg(fabricNumber: string): Promise<string | null> {
  if (!isCaccioppoliApiConfigured()) return null;
  const result = await lookupCaccioppoliItemImages(fabricNumber);
  if (!result.ok || !result.square) return null;
  return toJpegDataUrl(result.square);
}

async function loadSwatchJpeg(supplierId: string, fabricNumber: string): Promise<string | null> {
  const trimmed = fabricNumber.trim();
  if (!trimmed) return null;

  if (isDrapersSwatchSupplier(supplierId)) {
    return loadDrapersSwatchJpeg(trimmed);
  }
  if (isCaccioppoliSwatchSupplier(supplierId)) {
    return loadCaccioppoliSwatchJpeg(trimmed);
  }
  if (isLoroPianaSwatchSupplier(supplierId)) {
    return loadLoroPianaSwatchJpeg(trimmed);
  }
  return null;
}

/**
 * Server-side swatch resolution for PDF embedding.
 * Fetches Loro Piana / Solbiati from local disk or Supabase, Drapers and Caccioppoli via API.
 */
export async function loadFabricSwatchJpegsForPdf(
  fabrics: FabricSwatchKey[]
): Promise<Map<string, string>> {
  const unique = new Map<string, FabricSwatchKey>();
  for (const fabric of fabrics) {
    const key = swatchCacheKey(fabric.supplier_id, fabric.fabric_number);
    if (!unique.has(key)) unique.set(key, fabric);
  }

  const entries = await Promise.all(
    [...unique.entries()].map(async ([key, { supplier_id, fabric_number }]) => {
      const jpeg = await loadSwatchJpeg(supplier_id, fabric_number);
      return [key, jpeg] as const;
    })
  );

  const map = new Map<string, string>();
  for (const [key, jpeg] of entries) {
    if (jpeg) map.set(key, jpeg);
  }
  return map;
}

export { swatchCacheKey };
