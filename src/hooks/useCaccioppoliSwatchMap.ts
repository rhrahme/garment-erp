"use client";

import { useEffect, useState } from "react";

const CHUNK_SIZE = 5;

export type CaccioppoliSwatchUrls = {
  square: string;
  zoom: string;
};

type ImagesItem = {
  ok: boolean;
  item: string;
  requested_code?: string;
  medias?: { square: string; zoom: string };
};

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
            `/api/integrations/caccioppoli/images?codes=${encodeURIComponent(chunk.join(","))}`
          );
          const data = (await res.json()) as { items?: ImagesItem[]; error?: string };
          if (!res.ok) break;

          for (const item of data.items ?? []) {
            if (!item.ok || !item.medias?.square) continue;
            const urls: CaccioppoliSwatchUrls = {
              square: item.medias.square,
              zoom: item.medias.zoom || item.medias.square,
            };
            if (item.requested_code) next.set(item.requested_code, urls);
            next.set(item.item, urls);
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
