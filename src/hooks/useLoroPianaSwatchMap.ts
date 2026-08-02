"use client";

import { useEffect, useMemo, useState } from "react";
import { provisionalLoroPianaSwatchUrls } from "@/lib/fabric-sourcing/fabric-swatch-keys";
import { loroPianaSwatchImageUrl } from "@/lib/fabric-sourcing/loro-piana-swatch-url";
import { normalizeLoroPianaFabricNumber } from "@/lib/fabric-sourcing/loro-piana-styles";

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

function seedProvisionalMap(fabricNumbers: string[]): Map<string, LoroPianaSwatchUrls> {
  const seeded = new Map<string, LoroPianaSwatchUrls>();
  for (const fabricNumber of fabricNumbers) {
    const trimmed = fabricNumber.trim();
    if (!trimmed) continue;
    const normalized = normalizeLoroPianaFabricNumber(trimmed);
    const urls = provisionalLoroPianaSwatchUrls(normalized);
    seeded.set(trimmed, urls);
    seeded.set(normalized, urls);
    seeded.set(fabricNumber, urls);
  }
  return seeded;
}

export function useLoroPianaSwatchMap(fabricNumbers: string[]): Map<string, LoroPianaSwatchUrls> {
  const requestKey = fabricNumbers.join("\u0001");
  const provisional = useMemo(() => seedProvisionalMap(fabricNumbers), [requestKey]);
  const [map, setMap] = useState<Map<string, LoroPianaSwatchUrls>>(provisional);

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
            `/api/suppliers/loro-piana/images?codes=${encodeURIComponent(chunk.join(","))}`
          );
          const data = (await res.json()) as { items?: MediasItem[]; error?: string };
          if (!res.ok) break;

          for (const item of data.items ?? []) {
            if (!item.ok) continue;
            const apiUrl = loroPianaSwatchImageUrl(item.fabric_number);
            const urls: LoroPianaSwatchUrls = {
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
