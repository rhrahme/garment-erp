"use client";

import { useEffect, useState } from "react";
import {
  convertMeasurementUnit,
  formatMeasurement,
  parseMeasurement,
} from "@/lib/pattern-library/measurements";
import type { MeasurementUnit } from "@/lib/types/pattern-library";
import { cn } from "@/lib/utils";

/**
 * Numeric cell that displays inch fractions (5⅝) but accepts "5 5/8", "5.625",
 * or "5⅝". Commits the parsed number on blur / Enter.
 *
 * `value` / `onCommit` stay in `unit` (stored). When `displayUnit` differs,
 * the field shows and accepts numbers in the site-wide display unit.
 */
export function MeasurementInput({
  value,
  unit,
  displayUnit = unit,
  onCommit,
  className,
  placeholder = "—",
}: {
  value: number | null;
  unit: MeasurementUnit;
  displayUnit?: MeasurementUnit;
  onCommit: (next: number | null) => void;
  className?: string;
  placeholder?: string;
}) {
  const displayValue =
    value === null ? null : convertMeasurementUnit(value, unit, displayUnit);
  const display = displayValue === null ? "" : formatMeasurement(displayValue, displayUnit);
  const [text, setText] = useState(display);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(display);
  }, [display, focused]);

  function commit() {
    setFocused(false);
    const trimmed = text.trim();
    if (!trimmed) {
      if (value !== null) onCommit(null);
      setText("");
      return;
    }
    const parsedDisplay = parseMeasurement(trimmed);
    if (parsedDisplay === null) {
      setText(display);
      return;
    }
    const parsedStored = convertMeasurementUnit(parsedDisplay, displayUnit, unit);
    if (parsedStored !== value) onCommit(parsedStored);
    setText(formatMeasurement(parsedDisplay, displayUnit));
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={cn(
        "w-16 min-w-14 rounded-md border border-slate-200 px-1.5 py-1.5 text-center text-sm tabular-nums focus:border-indigo-400 focus:outline-none",
        className
      )}
    />
  );
}
