"use client";

import type { BasePattern, MeasurementPointDef } from "@/lib/types/pattern-library";

/**
 * In-memory cache for the slim base-pattern picker payload
 * (GET /api/pattern/library/bases: bases + dictionary, no client patterns).
 *
 * Pages that host a base-pattern picker call preloadBasePickerData() on mount
 * so the data is already in memory when the operator opens the dialog. The
 * cache survives dialog open/close and component remounts; after the TTL it
 * serves the last-known data instantly and revalidates in the background.
 */

export interface BasePickerData {
  base_patterns: BasePattern[];
  dictionary: MeasurementPointDef[];
}

const TTL_MS = 5 * 60 * 1000;

let cached: BasePickerData | null = null;
let fetchedAt = 0;
let inflight: Promise<BasePickerData> | null = null;

async function fetchPickerData(): Promise<BasePickerData> {
  const res = await fetch("/api/pattern/library/bases", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load base patterns.");
  const data = await res.json();
  return {
    base_patterns: data?.base_patterns ?? [],
    dictionary: data?.dictionary ?? [],
  };
}

/** Cached data if any (may be stale within TTL semantics) - for instant first paint. */
export function peekBasePickerData(): BasePickerData | null {
  return cached;
}

/**
 * Returns picker data, fetching at most once concurrently. Fresh cache
 * resolves immediately; stale cache resolves immediately too while a
 * background refresh updates it for the next caller.
 */
export function preloadBasePickerData(): Promise<BasePickerData> {
  const fresh = cached !== null && Date.now() - fetchedAt <= TTL_MS;
  if (fresh) return Promise.resolve(cached!);
  if (!inflight) {
    inflight = fetchPickerData()
      .then((data) => {
        cached = data;
        fetchedAt = Date.now();
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return cached ? Promise.resolve(cached) : inflight;
}

/** Drop the cache (e.g. after creating/editing a base) so the next open refetches. */
export function invalidateBasePickerCache(): void {
  cached = null;
  fetchedAt = 0;
}
