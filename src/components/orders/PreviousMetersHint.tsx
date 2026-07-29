"use client";

import { parseDecimalInput } from "@/lib/utils/decimal-input";

/**
 * Soft apply control under meters — shown when an earlier same garment+width
 * line has meters and the current field differs (or is empty).
 */
export function PreviousMetersHint({
  previousMeters,
  currentMeters,
  onApply,
}: {
  previousMeters: string | null;
  currentMeters: string;
  onApply: (meters: string) => void;
}) {
  if (!previousMeters) return null;

  const current = parseDecimalInput(currentMeters);
  const previous = parseDecimalInput(previousMeters);
  if (
    Number.isFinite(current) &&
    Number.isFinite(previous) &&
    current === previous
  ) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => onApply(previousMeters)}
      className="mt-1 text-left text-xs text-indigo-700 hover:text-indigo-900 hover:underline"
    >
      Use previous: {previousMeters} m
    </button>
  );
}
