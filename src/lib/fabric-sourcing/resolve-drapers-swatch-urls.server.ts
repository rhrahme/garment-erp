import { lookupDrapersSwatch } from "@/lib/fabric-sourcing/drapers-swatches";
import type { FabricSwatchUrls } from "@/lib/fabric-sourcing/fabric-swatch-keys";
import { lookupDrapersFabricMedias } from "@/lib/integrations/drapers/client";
import { isDrapersApiConfigured } from "@/lib/integrations/drapers/config";
import { getDrapersCatalogSwatchUrls } from "@/lib/integrations/drapers/drapers-catalog-swatches";

export type ResolvedDrapersSwatch = {
  ok: boolean;
  fabric_number: string;
  requested_code: string;
  square?: string;
  zoom?: string;
  url?: string;
  source?: "manifest" | "catalog" | "live_api";
};

/** Disk/Supabase manifest first, then price-free catalog index, then live Drapers medias API. */
export async function resolveDrapersSwatchUrls(fabricNumber: string): Promise<ResolvedDrapersSwatch> {
  const manifestHit = lookupDrapersSwatch(fabricNumber);
  if (manifestHit.ok && manifestHit.url) {
    return {
      ok: true,
      fabric_number: manifestHit.fabric_number,
      requested_code: manifestHit.requested_code,
      square: manifestHit.url,
      zoom: manifestHit.url,
      url: manifestHit.url,
      source: "manifest",
    };
  }

  const catalogHit = getDrapersCatalogSwatchUrls(fabricNumber);
  if (catalogHit?.square) {
    return {
      ok: true,
      fabric_number: manifestHit.fabric_number,
      requested_code: manifestHit.requested_code,
      square: catalogHit.square,
      zoom: catalogHit.zoom ?? catalogHit.square,
      url: catalogHit.square,
      source: "catalog",
    };
  }

  if (!isDrapersApiConfigured()) {
    return {
      ok: false,
      fabric_number: manifestHit.fabric_number,
      requested_code: manifestHit.requested_code,
    };
  }

  const live = await lookupDrapersFabricMedias(fabricNumber);
  if (live.ok && live.medias.square) {
    return {
      ok: true,
      fabric_number: live.fabric_code,
      requested_code: manifestHit.requested_code,
      square: live.medias.square,
      zoom: live.medias.zoom || live.medias.square,
      url: live.medias.square,
      source: "live_api",
    };
  }

  return {
    ok: false,
    fabric_number: manifestHit.fabric_number,
    requested_code: manifestHit.requested_code,
  };
}

export async function resolveDrapersSwatchUrlsBatch(fabricNumbers: string[]): Promise<ResolvedDrapersSwatch[]> {
  return Promise.all(fabricNumbers.map((code) => resolveDrapersSwatchUrls(code)));
}

export function isRemoteSwatchUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export async function fetchRemoteSwatchBytes(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export function swatchUrlsFromResolved(item: ResolvedDrapersSwatch): FabricSwatchUrls | undefined {
  if (!item.ok || !item.square) return undefined;
  return { square: item.square, zoom: item.zoom ?? item.square };
}
