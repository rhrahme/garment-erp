"use client";

import { useMemo } from "react";
import {
  DEFAULT_PHONE_DIAL,
  PHONE_COUNTRIES,
  formatStoredPhone,
  parseStoredPhone,
} from "@/lib/phone/countries";
import { cn } from "@/lib/utils";

interface PhoneInputProps {
  value: string | null;
  onChange: (value: string | null) => void;
  className?: string;
  inputClassName?: string;
  id?: string;
}

export function PhoneInput({ value, onChange, className, inputClassName, id }: PhoneInputProps) {
  const parsed = useMemo(() => parseStoredPhone(value), [value]);
  const isSaudi = parsed.dial === DEFAULT_PHONE_DIAL;

  function update(dial: string, local: string) {
    onChange(formatStoredPhone(dial, local));
  }

  return (
    <div className={cn("flex gap-2", className)}>
      <select
        value={parsed.dial}
        onChange={(e) => update(e.target.value, parsed.local)}
        className="w-[9.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
        aria-label="Country code"
      >
        {PHONE_COUNTRIES.map((country) => (
          <option key={country.code} value={country.dial}>
            {country.dial} {country.label}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={parsed.local}
        onChange={(e) => update(parsed.dial, e.target.value.replace(/[^\d\s-]/g, ""))}
        placeholder={isSaudi ? "5X XXX XXXX" : "Mobile number"}
        className={cn(
          "min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2",
          inputClassName
        )}
      />
    </div>
  );
}
