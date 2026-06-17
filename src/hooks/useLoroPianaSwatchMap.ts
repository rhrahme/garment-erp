"use client";

import { useEffect, useState } from "react";

const CHUNK_SIZE = 30;

export type LoroPianaSwatchUrls = {
  square: string;
  zoom: string;
};

type MediasItem = {
  ok: boolean;
  fabric_number: string;
  requested_code?: string;
  square?: string;
  zoom?: string;
  url?: string;
};

export function useLoroPianaSwatchMap(fabricNumbers: string[]): Map<string, LoroPianaSwatchUrls> {
  const [map, setMap] = useState<Map<string, LoroPianaSwatchUrls>>(() => new Map());
  const requestKey = fabricNumbers.join("\u0001");

  useEffect(() => {
    if (fabricNumbers.length === 0) {
      setMap(new Map());
      return;
    }

    let cancelled = false;

    void (async () => {
      const next = new Map<string, LoroPianaSwatchUrls>();

      for (let i = 0; i < fabricNumbers.length; i += CHUNK_SIZE) {
        const chunk = fabricNumbers.slice(i, i + CHUNK_SIZE);
        try {
          const res = await fetch(
            `/api/suppliers/loro-piana/images?codes=${encodeURIComponent(chunk.join(","))}`
          );
          const data = (await res.json()) as { items?: MediasItem[]; error?: string };
          if (!res.ok) break;

          for (const item of data.items ?? []) {
            if (!item.ok) continue;
            const square = item.square ?? item.url;
            if (!square) continue;
            const urls: LoroPianaSwatchUrls = {
              square,
              zoom: item.zoom ?? square,
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
