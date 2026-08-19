"use client";

import { CLIENT_TITLE_OPTIONS, normalizeClientTitle } from "@/lib/clients/names";

type ClientTitleSelectProps = {
  value: string | null | undefined;
  onChange: (title: string | null) => void;
  disabled?: boolean;
  className?: string;
};

export function ClientTitleSelect({ value, onChange, disabled, className }: ClientTitleSelectProps) {
  const canonical = normalizeClientTitle(value);
  const extra = canonical && !CLIENT_TITLE_OPTIONS.includes(canonical as (typeof CLIENT_TITLE_OPTIONS)[number]);

  return (
    <select
      value={canonical ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
      disabled={disabled}
      className={className}
      aria-label="Title"
    >
      <option value="">Title</option>
      {CLIENT_TITLE_OPTIONS.map((title) => (
        <option key={title} value={title}>
          {title}
        </option>
      ))}
      {extra ? <option value={canonical}>{canonical}</option> : null}
    </select>
  );
}
