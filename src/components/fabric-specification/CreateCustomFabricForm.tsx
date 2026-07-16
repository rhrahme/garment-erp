"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ClientSearchSelect } from "@/components/clients/ClientSearchSelect";
import { formatClientDisplayName } from "@/lib/clients/names";
import type { ClientProfile } from "@/lib/types/clients";
import type { SupplierFabric } from "@/lib/types/fabric-sourcing";
import type { PriceCurrency } from "@/lib/currency/config";

interface CreateCustomFabricFormProps {
  nextFabricNumber: string;
  onCreated: (fabric: SupplierFabric) => void;
  onCancel: () => void;
}

type FormState = {
  description: string;
  color: string;
  composition: string;
  weight_gsm: string;
  width_cm: string;
  unit_price: string;
  currency: PriceCurrency;
  source_note: string;
  client_id: string;
  sales_order_id: string;
};

const EMPTY_FORM: FormState = {
  description: "",
  color: "",
  composition: "",
  weight_gsm: "",
  width_cm: "",
  unit_price: "",
  currency: "EUR",
  source_note: "",
  client_id: "",
  sales_order_id: "",
};

export function CreateCustomFabricForm({
  nextFabricNumber,
  onCreated,
  onCancel,
}: CreateCustomFabricFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/clients")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.clients) return;
        setClients(data.clients as ClientProfile[]);
      })
      .catch(() => {
        /* optional client link */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const selected = clients.find((c) => c.id === form.client_id);
      const res = await fetch("/api/custom-fabrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.description.trim(),
          color: form.color.trim() || null,
          composition: form.composition.trim() || null,
          weight_gsm: form.weight_gsm.trim() ? Number(form.weight_gsm) : null,
          width_cm: form.width_cm.trim() ? Number(form.width_cm) : null,
          unit_price: form.unit_price.trim() ? Number(form.unit_price) : null,
          currency: form.unit_price.trim() ? form.currency : null,
          source_note: form.source_note.trim() || null,
          client_id: form.client_id || null,
          client_name: selected ? formatClientDisplayName(selected) : null,
          sales_order_id: form.sales_order_id.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create fabric.");
      }
      onCreated(data.supplier_fabric as SupplierFabric);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create fabric.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
  const labelClass = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Create custom / one-off fabric</h3>
          <p className="text-xs text-slate-600">
            Next number: <span className="font-mono font-medium text-amber-900">{nextFabricNumber}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          Cancel
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3">
          <label className={labelClass}>
            Display name / description <span className="text-red-600">*</span>
          </label>
          <input
            required
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="e.g. Navy wool leftover from mill visit"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Color</label>
          <input
            value={form.color}
            onChange={(e) => update("color", e.target.value)}
            placeholder="Navy"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Composition</label>
          <input
            value={form.composition}
            onChange={(e) => update("composition", e.target.value)}
            placeholder="100% Wool"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Source note</label>
          <input
            value={form.source_note}
            onChange={(e) => update("source_note", e.target.value)}
            placeholder="Mill / shop / client swatch"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Weight (gsm)</label>
          <input
            type="number"
            min={0}
            step="1"
            value={form.weight_gsm}
            onChange={(e) => update("weight_gsm", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Width (cm)</label>
          <input
            type="number"
            min={0}
            step="0.1"
            value={form.width_cm}
            onChange={(e) => update("width_cm", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Unit price</label>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.unit_price}
              onChange={(e) => update("unit_price", e.target.value)}
              className={inputClass}
            />
            <select
              value={form.currency}
              onChange={(e) => update("currency", e.target.value as PriceCurrency)}
              className="w-24 shrink-0 rounded-lg border border-slate-300 px-2 py-2 text-sm"
            >
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="AED">AED</option>
            </select>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass}>Client (optional)</label>
          <ClientSearchSelect
            clients={clients}
            value={form.client_id}
            onChange={(clientId) => update("client_id", clientId)}
            showSort={false}
            placeholder="Link to a client…"
          />
        </div>

        <div>
          <label className={labelClass}>Sales order id (optional)</label>
          <input
            value={form.sales_order_id}
            onChange={(e) => update("sales_order_id", e.target.value)}
            placeholder="SO id or number"
            className={inputClass}
          />
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !form.description.trim()}
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : `Create ${nextFabricNumber}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
