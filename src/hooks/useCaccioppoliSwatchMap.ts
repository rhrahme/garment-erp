"use client";

import { useEffect, useMemo, useState } from "react";
import { caccioppoliSwatchImageUrl } from "@/lib/fabric-sourcing/caccioppoli-swatch-url";
import { provisionalCaccioppoliSwatchUrls } from "@/lib/fabric-sourcing/fabric-swatch-keys";

const CHUNK_SIZE = 30;

export type CaccioppoliSwatchUrls = {
  square: string;
  zoom: string;
};

type SwatchItem = {
  ok: boolean;
  fabric_number: string;
  requested_code?: string;
  square?: string;
  zoom?: string;
  url?: string;
};

function seedProvisionalMap(fabricNumbers: string[]): Map<string, CaccioppoliSwatchUrls> {
  const seeded = new Map<string, CaccioppoliSwatchUrls>();
  for (const fabricNumber of fabricNumbers) {
    const trimmed = fabricNumber.trim();
    if (!trimmed) continue;
    const urls = provisionalCaccioppoliSwatchUrls(trimmed);
    seeded.set(trimmed, urls);
    seeded.set(fabricNumber, urls);
  }
  return seeded;
}

/** Cached local/Supabase swatches — no live getItemImages on the hot path. */
export function useCaccioppoliSwatchMap(fabricNumbers: string[]): Map<string, CaccioppoliSwatchUrls> {
  const requestKey = fabricNumbers.join("\u0001");
  const provisional = useMemo(() => seedProvisionalMap(fabricNumbers), [requestKey]);
  const [map, setMap] = useState<Map<string, CaccioppoliSwatchUrls>>(provisional);

  useEffect(() => {
    setMap(provisional);

    if (fabricNumbers.length === 0) return;

    let cancelled = false;

    void (async () => {
      const next = new Map(provisional);

      for (let i = 0; i < fabricNumbers.length; i += CHUNK_SIZE) {
        const chunk = fabricNumbers.slice(i, i + CHUNK_SIZE);
        try {
          const res = await fetch(
            `/api/suppliers/caccioppoli/images?codes=${encodeURIComponent(chunk.join(","))}`
          );
          const data = (await res.json()) as { items?: SwatchItem[]; error?: string };
          if (!res.ok) break;

          for (const item of data.items ?? []) {
            if (!item.ok) continue;
            const apiUrl = caccioppoliSwatchImageUrl(item.fabric_number);
            const urls: CaccioppoliSwatchUrls = {
              square: apiUrl,
              zoom: apiUrl,
            };
            if (item.requested_code) next.set(item.requested_code, urls);
            next.set(item.fabric_number, urls);
          }
        } catch {
          break;
        }
        if (cancelled) return;
      }

      if (!cancelled) setMap(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [requestKey, provisional]);

  return map;
}
