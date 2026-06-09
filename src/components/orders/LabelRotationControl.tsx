"use client";

import {
  DEFAULT_LABEL_ROTATION,
  LABEL_ROTATION_OPTIONS,
  type LabelRotationDeg,
} from "@/lib/production/label-printer-settings";

type LabelRotationControlProps = {
  value: LabelRotationDeg;
  onChange: (rotation: LabelRotationDeg) => void;
  compact?: boolean;
};

export function LabelRotationControl({ value, onChange, compact = false }: LabelRotationControlProps) {
  const selected = LABEL_ROTATION_OPTIONS.find((option) => option.value === value);

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <label className="block text-sm font-medium text-slate-700" htmlFor="label-rotation-select">
        Label rotation
      </label>
      <select
        id="label-rotation-select"
        value={value}
        onChange={(event) => onChange(Number(event.target.value) as LabelRotationDeg)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {LABEL_ROTATION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {selected ? (
        <p className={`text-slate-600 ${compact ? "text-xs" : "text-sm"}`}>{selected.description}</p>
      ) : null}
      {!compact ? (
        <p className="text-xs text-slate-500">
          Default is {DEFAULT_LABEL_ROTATION}°. Print a test label, then change rotation until QR and text read
          correctly on your {`102×51 mm`} roll.
        </p>
      ) : null}
    </div>
  );
}
