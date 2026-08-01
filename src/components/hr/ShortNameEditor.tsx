"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

async function patchShortName(url: string, shortName: string): Promise<PayrollEmployee> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ short_name: shortName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Save failed");
  return data.employee as PayrollEmployee;
}

export function ShortNameEditor({
  employee,
  onUpdated,
  patchUrl,
}: {
  employee: PayrollEmployee;
  onUpdated: (employee: PayrollEmployee) => void;
  patchUrl: string;
}) {
  const saved = String(employee.short_name ?? "").trim();
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = draft.trim() !== saved;

  useEffect(() => {
    if (!dirty) setDraft(saved);
  }, [saved, dirty]);

  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await patchShortName(patchUrl, draft.trim());
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full text-left">
      <label className="block text-xs font-medium text-slate-600">
        Short name
        <span className="ml-1 font-normal text-slate-400">(badge only)</span>
      </label>
      <div className="mt-1 flex gap-1.5">
        <input
          type="text"
          value={draft}
          disabled={saving}
          onChange={(e) => {
            setError(null);
            setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSave();
            }
          }}
          placeholder="Nickname on badge"
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-800 disabled:opacity-60"
        />
        <button
          type="button"
          disabled={saving || !dirty}
          onClick={() => void handleSave()}
          className="inline-flex shrink-0 items-center rounded bg-[#0B2C5A] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#0B2C5A]/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
