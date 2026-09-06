"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  SAMPLE_RETURN_VIA_HINTS,
  SAMPLE_RETURN_VIA_LABELS,
  type SampleReturnVia,
} from "@/lib/clients/ready-made-sample-fields";
import {
  GARMENT_HANDOVER_HINTS,
  GARMENT_HANDOVER_LABELS,
  type GarmentHandoverTo,
} from "@/lib/production/garment-handover";

export type DeliveryChoice = GarmentHandoverTo | "in_person";

export function GarmentDeliveryForm({
  includeInPerson = false,
  disabled = false,
  onSubmit,
}: {
  includeInPerson?: boolean;
  disabled?: boolean;
  onSubmit: (via: DeliveryChoice, proof: File | null) => Promise<void>;
}) {
  const [via, setVia] = useState<DeliveryChoice | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const proofInput = useRef<HTMLInputElement | null>(null);

  const hint = via
    ? includeInPerson
      ? SAMPLE_RETURN_VIA_HINTS[via as SampleReturnVia]
      : GARMENT_HANDOVER_HINTS[via as GarmentHandoverTo]
    : null;
  const submitLabel = via === "in_person" ? "Gave it back" : "Sent";
  const busy = disabled || submitting;

  async function handleSubmit() {
    if (busy) return;
    if (!via) {
      setLocalError("Say who took the garment.");
      return;
    }
    setLocalError(null);
    setSubmitting(true);
    try {
      await onSubmit(via, file);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">
          Who took the garment?
        </span>
        <select
          value={via}
          disabled={busy}
          onChange={(event) => {
            setVia(event.target.value as DeliveryChoice | "");
            setLocalError(null);
          }}
          className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
        >
          <option value="">Choose...</option>
          {includeInPerson ? (
            <option value="in_person">{SAMPLE_RETURN_VIA_LABELS.in_person}</option>
          ) : null}
          <option value="factory_driver">{GARMENT_HANDOVER_LABELS.factory_driver}</option>
          <option value="client_driver">{GARMENT_HANDOVER_LABELS.client_driver}</option>
        </select>
      </label>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}

      <input
        ref={proofInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const next = event.target.files?.[0] ?? null;
          setFile(next);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => proofInput.current?.click()}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {file ? file.name : "Add proof photo"}
        </button>
        {file ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setFile(null);
              if (proofInput.current) proofInput.current.value = "";
            }}
            className="text-xs text-slate-500 hover:text-slate-800 disabled:opacity-50"
          >
            Clear
          </button>
        ) : null}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void handleSubmit()}
        className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
        {submitting ? "Saving..." : submitLabel}
      </button>
      {localError ? <p className="text-xs text-red-700">{localError}</p> : null}
    </div>
  );
}
