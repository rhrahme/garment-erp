"use client";

import { useEffect, useState } from "react";
import { getDrapersUiSwatchUrls } from "@/lib/integrations/drapers/drapers-catalog-swatches";
import { drapersSwatchImageUrl } from "@/lib/fabric-sourcing/drapers-swatch-url";

const CHUNK_SIZE = 30;

export type DrapersSwatchUrls = {
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

/** Cached local/Supabase swatches first, then catalog remote URLs — no live medias API. */
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

      for (const fabricNumber of fabricNumbers) {
        const cached = getDrapersUiSwatchUrls(fabricNumber);
        if (cached?.square) {
          next.set(fabricNumber, cached);
          const trimmed = fabricNumber.trim();
          if (trimmed !== fabricNumber) next.set(trimmed, cached);
        }
      }

      for (let i = 0; i < fabricNumbers.length; i += CHUNK_SIZE) {
        const chunk = fabricNumbers.slice(i, i + CHUNK_SIZE);
        try {
          const res = await fetch(
            `/api/suppliers/drapers/images?codes=${encodeURIComponent(chunk.join(","))}`
          );
          const data = (await res.json()) as { items?: SwatchItem[]; error?: string };
          if (!res.ok) break;

          for (const item of data.items ?? []) {
            if (!item.ok) continue;
            const apiUrl = drapersSwatchImageUrl(item.fabric_number);
            const urls: DrapersSwatchUrls = {
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
