"use client";

import {
  DEFAULT_LABEL_ROTATION,
  DEFAULT_LABEL_SCALE_PCT,
  LABEL_ROTATION_OPTIONS,
  LABEL_SCALE_OPTIONS,
  type LabelRotationDeg,
  type LabelScalePct,
} from "@/lib/production/label-printer-settings";

type LabelPrinterSettingsControlProps = {
  rotation: LabelRotationDeg;
  onRotationChange: (rotation: LabelRotationDeg) => void;
  scalePct: LabelScalePct;
  onScalePctChange: (scalePct: LabelScalePct) => void;
  compact?: boolean;
};

export function LabelPrinterSettingsControl({
  rotation,
  onRotationChange,
  scalePct,
  onScalePctChange,
  compact = false,
}: LabelPrinterSettingsControlProps) {
  const selectedRotation = LABEL_ROTATION_OPTIONS.find((option) => option.value === rotation);
  const selectedScale = LABEL_SCALE_OPTIONS.find((option) => option.value === scalePct);

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className={compact ? "space-y-1" : "space-y-2"}>
        <label className="block text-sm font-medium text-slate-700" htmlFor="label-rotation-select">
          Label rotation
        </label>
        <select
          id="label-rotation-select"
          value={rotation}
          onChange={(event) => onRotationChange(Number(event.target.value) as LabelRotationDeg)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {LABEL_ROTATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {selectedRotation ? (
          <p className={`text-slate-600 ${compact ? "text-xs" : "text-sm"}`}>
            {selectedRotation.description}
          </p>
        ) : null}
      </div>

      <div className={compact ? "space-y-1" : "space-y-2"}>
        <label className="block text-sm font-medium text-slate-700" htmlFor="label-scale-select">
          Label size
        </label>
        <select
          id="label-scale-select"
          value={scalePct}
          onChange={(event) => onScalePctChange(Number(event.target.value) as LabelScalePct)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {LABEL_SCALE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {selectedScale ? (
          <p className={`text-slate-600 ${compact ? "text-xs" : "text-sm"}`}>{selectedScale.description}</p>
        ) : null}
      </div>

      {!compact ? (
        <p className="text-xs text-slate-500">
          Default rotation is {DEFAULT_LABEL_ROTATION}° and size is {DEFAULT_LABEL_SCALE_PCT}%. Print a test
          label, then adjust rotation until QR and text read correctly, and size until content fills your{" "}
          {`102×51 mm`} roll.
        </p>
      ) : null}
    </div>
  );
}

/** @deprecated Use LabelPrinterSettingsControl */
export function LabelRotationControl({
  value,
  onChange,
  compact = false,
}: {
  value: LabelRotationDeg;
  onChange: (rotation: LabelRotationDeg) => void;
  compact?: boolean;
}) {
  return (
    <LabelPrinterSettingsControl
      rotation={value}
      onRotationChange={onChange}
      scalePct={DEFAULT_LABEL_SCALE_PCT}
      onScalePctChange={() => {}}
      compact={compact}
    />
  );
}
