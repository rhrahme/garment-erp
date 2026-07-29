"use client";

import { useEffect, useState } from "react";
import { caccioppoliSwatchImageUrl } from "@/lib/fabric-sourcing/caccioppoli-swatch-url";

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

/** Cached local/Supabase swatches — no live getItemImages on the hot path. */
export function useCaccioppoliSwatchMap(fabricNumbers: string[]): Map<string, CaccioppoliSwatchUrls> {
  const [map, setMap] = useState<Map<string, CaccioppoliSwatchUrls>>(() => new Map());
  const requestKey = fabricNumbers.join("\u0001");

  useEffect(() => {
    if (fabricNumbers.length === 0) {
      setMap(new Map());
      return;
    }

    let cancelled = false;

    void (async () => {
      const next = new Map<string, CaccioppoliSwatchUrls>();

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
  }, [requestKey]);

  return map;
}
