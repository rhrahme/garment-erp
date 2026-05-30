"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AutoSaveStatusBar } from "@/components/ui/AutoSaveStatus";
import { useAutoSave } from "@/hooks/useAutoSave";
import { formatDate } from "@/lib/utils";
import type { SupplierContactRow, SupplierContactsFile } from "@/lib/types/supplier-contacts";

type EditableSupplier = SupplierContactRow;

function emptyDraft(): SupplierContactsFile {
  return {
    factory_orders_email: null,
    inbox_scan_email: null,
    notes: null,
    updated_at: null,
    suppliers: [],
  };
}

function cloneContacts(data: SupplierContactsFile): SupplierContactsFile {
  return JSON.parse(JSON.stringify(data)) as SupplierContactsFile;
}

export function SupplierContactsEditor() {
  const [saved, setSaved] = useState<SupplierContactsFile>(emptyDraft());
  const [draft, setDraft] = useState<SupplierContactsFile>(emptyDraft());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/supplier-contacts");
        if (!res.ok) throw new Error("Failed to load supplier contacts");
        const data = (await res.json()) as SupplierContactsFile;
        setSaved(data);
        setDraft(cloneContacts(data));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load supplier contacts");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const isDirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);

  const persistDraft = useCallback(async () => {
    const res = await fetch("/api/supplier-contacts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to save supplier contacts");
    setSaved(data as SupplierContactsFile);
    setDraft(cloneContacts(data as SupplierContactsFile));
    setError(null);
  }, [draft]);

  const { status: autoSaveStatus, error: autoSaveError, isSaving, saveNow } = useAutoSave({
    isDirty,
    canSave: true,
    onSave: persistDraft,
  });

  const withEmail = draft.suppliers.filter((s) => s.emails.length > 0).length;
  const missingEmail = draft.suppliers.filter((s) => s.emails.length === 0).length;

  function emailsToText(emails: string[]): string {
    return emails.join("\n");
  }

  function textToEmails(value: string): string[] {
    return [...new Set(value.split(/[\n,;]+/).map((part) => part.trim()).filter(Boolean))];
  }

  function updateSupplier(id: string, patch: Partial<EditableSupplier>) {
    setDraft((prev) => ({
      ...prev,
      suppliers: prev.suppliers.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }

  function handleDiscard() {
    setDraft(cloneContacts(saved));
    setEditingId(null);
    setError(null);
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
        Loading supplier contacts…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">Suppliers</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{draft.suppliers.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm font-medium text-emerald-700">With order email</p>
          <p className="mt-2 text-3xl font-bold text-emerald-900">{withEmail}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-medium text-amber-700">Missing email</p>
          <p className="mt-2 text-3xl font-bold text-amber-900">{missingEmail}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
          <label className="block text-sm font-semibold text-indigo-900">Factory orders inbox</label>
          <p className="mt-1 text-sm text-indigo-800">
            The email address fabric purchase orders are sent from.
          </p>
          <input
            type="email"
            value={draft.factory_orders_email ?? ""}
            onChange={(e) => {
              setDraft((prev) => ({ ...prev, factory_orders_email: e.target.value || null }));
            }}
            placeholder="orders.ruh@hagan.pro"
            className="mt-3 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <label className="block text-sm font-semibold text-amber-900">Inbox to scan</label>
          <p className="mt-1 text-sm text-amber-800">
            Supplier replies, invoices, and AWB tracking are read from this mailbox via IMAP. Change when you move off a
            temporary inbox (e.g. personal Gmail).
          </p>
          <input
            type="email"
            value={draft.inbox_scan_email ?? ""}
            onChange={(e) => {
              setDraft((prev) => ({ ...prev, inbox_scan_email: e.target.value || null }));
            }}
            placeholder="rhrahme@gmail.com"
            className="mt-3 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">Fabric supplier contacts</h2>
            <p className="text-sm text-slate-500">
              These emails are used when sending fabric purchase orders. Add one address per line — all addresses receive the order together.
              {saved.updated_at ? ` Last updated ${formatDate(saved.updated_at)}.` : ""}
            </p>
            <AutoSaveStatusBar status={autoSaveStatus} error={autoSaveError} isDirty={isDirty} />
          </div>
          <div className="flex gap-2">
            {isDirty && (
              <Button variant="secondary" onClick={handleDiscard} disabled={isSaving}>
                Discard
              </Button>
            )}
            {isDirty && autoSaveStatus === "error" && (
              <Button variant="secondary" onClick={() => void saveNow()} disabled={isSaving}>
                Retry save
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-4 py-3 font-medium text-slate-600">Supplier</th>
                <th className="px-4 py-3 font-medium text-slate-600">Code</th>
                <th className="px-4 py-3 font-medium text-slate-600">Order emails</th>
                <th className="px-4 py-3 font-medium text-slate-600">Contact</th>
                <th className="px-4 py-3 font-medium text-slate-600">Country</th>
                <th className="px-4 py-3 font-medium text-slate-600">Lead time</th>
                <th className="px-4 py-3 font-medium text-slate-600">Price list</th>
                <th className="px-4 py-3 font-medium text-slate-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {draft.suppliers.map((supplier) => {
                const isEditing = editingId === supplier.id;
                return (
                  <tr key={supplier.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-4 py-4">
                      {isEditing ? (
                        <input
                          value={supplier.name}
                          onChange={(e) => updateSupplier(supplier.id, { name: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      ) : (
                        <div>
                          <p className="font-medium text-slate-900">{supplier.name}</p>
                          {supplier.notes && <p className="mt-1 text-xs text-slate-400">{supplier.notes}</p>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-600">{supplier.code}</td>
                    <td className="px-4 py-4">
                      {isEditing ? (
                        <textarea
                          value={emailsToText(supplier.emails)}
                          onChange={(e) => {
                            const emails = textToEmails(e.target.value);
                            updateSupplier(supplier.id, {
                              emails,
                              email: emails.length > 0 ? emails.join(", ") : null,
                            });
                          }}
                          placeholder={"orders@supplier.com\ncontact@supplier.com"}
                          rows={3}
                          className="w-full min-w-[240px] rounded-lg border border-slate-300 px-3 py-2"
                        />
                      ) : supplier.emails.length > 0 ? (
                        <div className="space-y-1">
                          {supplier.emails.map((address) => (
                            <a
                              key={address}
                              href={`mailto:${address}`}
                              className="block font-medium text-indigo-600 hover:underline"
                            >
                              {address}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-amber-600">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {isEditing ? (
                        <input
                          value={supplier.contact_person ?? ""}
                          onChange={(e) => updateSupplier(supplier.id, { contact_person: e.target.value || null })}
                          placeholder="Contact name"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      ) : (
                        <span className="text-slate-600">{supplier.contact_person ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {isEditing ? (
                        <input
                          value={supplier.country ?? ""}
                          onChange={(e) => updateSupplier(supplier.id, { country: e.target.value || null })}
                          placeholder="Country"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      ) : (
                        <span className="text-slate-600">{supplier.country ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          value={supplier.lead_time_days}
                          onChange={(e) =>
                            updateSupplier(supplier.id, { lead_time_days: Number(e.target.value) || 0 })
                          }
                          className="w-24 rounded-lg border border-slate-300 px-3 py-2"
                        />
                      ) : (
                        <span className="text-slate-600">{supplier.lead_time_days} days</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {supplier.has_price_list ? (
                        <Badge className="bg-emerald-100 text-emerald-700">Imported</Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600">Pending</Badge>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(isEditing ? null : supplier.id)}
                      >
                        {isEditing ? "Done" : "Edit"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
