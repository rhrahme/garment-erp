"use client";

import { useEffect, useState } from "react";
import { formatMeasurement, parseMeasurement } from "@/lib/pattern-library/measurements";
import type { MeasurementUnit } from "@/lib/types/pattern-library";
import { cn } from "@/lib/utils";

/**
 * Numeric cell that displays inch fractions (5⅝) but accepts "5 5/8", "5.625",
 * or "5⅝". Commits the parsed number on blur / Enter.
 */
export function MeasurementInput({
  value,
  unit,
  onCommit,
  className,
  placeholder = "—",
}: {
  value: number | null;
  unit: MeasurementUnit;
  onCommit: (next: number | null) => void;
  className?: string;
  placeholder?: string;
}) {
  const display = value === null ? "" : formatMeasurement(value, unit);
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
    const parsed = parseMeasurement(trimmed);
    if (parsed === null) {
      setText(display);
      return;
    }
    if (parsed !== value) onCommit(parsed);
    setText(formatMeasurement(parsed, unit));
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
