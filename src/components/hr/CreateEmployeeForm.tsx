"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import type { IdBadgeGroup } from "@/lib/hr/payroll-utils";

export function CreateEmployeeForm({ defaultGroup }: { defaultGroup: IdBadgeGroup }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [employeeIdNumber, setEmployeeIdNumber] = useState("");
  const [badgeGroup, setBadgeGroup] = useState<IdBadgeGroup>(defaultGroup);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          employee_id_number: employeeIdNumber,
          badge_group: badgeGroup,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to create employee.");
      }
      setFullName("");
      setEmployeeIdNumber("");
      setBadgeGroup(defaultGroup);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create employee.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
      >
        <Plus className="h-4 w-4" />
        Add employee
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:max-w-lg"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-900">Add employee</p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Creates identity + QR badge only. Salary and bank account stay empty for payroll later.
      </p>
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Full name</span>
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Employee full name"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Employee ID number</span>
          <input
            required
            value={employeeIdNumber}
            onChange={(e) => setEmployeeIdNumber(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
            placeholder="National / employee ID"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Badge group</span>
          <select
            value={badgeGroup}
            onChange={(e) => setBadgeGroup(e.target.value as IdBadgeGroup)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="saudi">Saudis</option>
            <option value="expat">Expats</option>
          </select>
        </label>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={saving}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {saving ? "Saving…" : "Create employee"}
      </button>
    </form>
  );
}
