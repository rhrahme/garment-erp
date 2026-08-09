import type { MeasurementUnit } from "@/lib/types/pattern-library";

/** Browser preference for Pattern measurement display (cm | inches). */
export const MEASUREMENT_UNIT_PREF_KEY = "erp-pattern-measurement-unit";

export const DEFAULT_MEASUREMENT_UNIT: MeasurementUnit = "in";

export function parseMeasurementUnit(value: unknown): MeasurementUnit | null {
  return value === "cm" || value === "in" ? value : null;
}

/**
 * Display unit for Pattern sheets/print: URL `?unit=` wins (PDF + shared links),
 * else the site-wide localStorage preference.
 */
export function resolvePatternDisplayUnit(
  urlUnit: string | null | undefined,
  preferenceUnit: MeasurementUnit
): MeasurementUnit {
  return parseMeasurementUnit(urlUnit) ?? preferenceUnit;
}

export function readMeasurementUnitPreference(): MeasurementUnit {
  if (typeof window === "undefined") return DEFAULT_MEASUREMENT_UNIT;
  return parseMeasurementUnit(window.localStorage.getItem(MEASUREMENT_UNIT_PREF_KEY))
    ?? DEFAULT_MEASUREMENT_UNIT;
}

export function writeMeasurementUnitPreference(unit: MeasurementUnit): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MEASUREMENT_UNIT_PREF_KEY, unit);
}

/** Append or replace `unit` on a Pattern print/PDF URL. */
export function withMeasurementUnitParam(href: string, unit: MeasurementUnit): string {
  const hashIndex = href.indexOf("#");
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const url = new URL(withoutHash, "https://erp.local");
  url.searchParams.set("unit", unit);
  return `${url.pathname}${url.search}${hash}`;
}
