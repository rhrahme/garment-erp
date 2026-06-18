"use client";

import { formatDecimalDisplay, parseDecimalInput } from "@/lib/utils/decimal-input";

export function MetersInput({
  value,
  onChange,
  className,
  placeholder = "e.g. 3.5",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        const parsed = parseDecimalInput(value);
        if (Number.isFinite(parsed)) {
          onChange(formatDecimalDisplay(parsed));
        }
      }}
      placeholder={placeholder}
      className={className}
    />
  );
}
