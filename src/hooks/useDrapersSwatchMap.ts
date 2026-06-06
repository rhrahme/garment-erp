"use client";

import { useEffect, useState } from "react";

const CHUNK_SIZE = 30;

export type DrapersSwatchUrls = {
  square: string;
  zoom: string;
};

type MediasItem = {
  ok: boolean;
  fabric_code: string;
  requested_code?: string;
  medias?: { square: string; zoom: string; ruler: string };
};

export function useDrapersSwatchMap(fabricNumbers: string[]): Map<string, DrapersSwatchUrls> {
  const [map, setMap] = useState<Map<string, DrapersSwatchUrls>>(() => new Map());
  const requestKey = fabricNumbers.join("\u0001");

  useEffect(() => {
    if (fabricNumbers.length === 0) {
      setMap(new Map());
      return;
    }

    let cancelled = false;

    void (async () => {
      const next = new Map<string, DrapersSwatchUrls>();

      for (let i = 0; i < fabricNumbers.length; i += CHUNK_SIZE) {
        const chunk = fabricNumbers.slice(i, i + CHUNK_SIZE);
        try {
          const res = await fetch(
            `/api/integrations/drapers/medias?codes=${encodeURIComponent(chunk.join(","))}`
          );
          const data = (await res.json()) as { items?: MediasItem[]; error?: string };
          if (!res.ok) break;

          for (const item of data.items ?? []) {
            if (!item.ok || !item.medias?.square) continue;
            const urls: DrapersSwatchUrls = {
              square: item.medias.square,
              zoom: item.medias.zoom || item.medias.square,
            };
            if (item.requested_code) next.set(item.requested_code, urls);
            next.set(item.fabric_code, urls);
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
