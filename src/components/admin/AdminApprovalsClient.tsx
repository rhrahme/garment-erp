"use client";

import { useMemo, useState } from "react";

/**
 * Phone-friendly approvals list (linked from admin emails, token-authorized).
 * Every pending admin request stacked with Approve/Reject per row, plus
 * select-all + approve/reject selected.
 */

type NameChangeRow = {
  client_id: string;
  client_code: string;
  current_name: string;
  proposed_name: string;
  requested_by: string;
  requested_at: string;
};

type SewingRow = {
  id: string;
  label: string;
  production_code: string | null;
  employee_name: string | null;
  so_number: string | null;
  requested_by: string;
  requested_at: string;
  reason: string | null;
};

type FabricDeleteRow = {
  order_id: string;
  line_id: string;
  so_number: string;
  article_label: string;
  fabric_number: string;
  garment_type: string;
  client_name: string;
  requested_by: string;
  requested_at: string;
  reason: string | null;
};

type Decision =
  | { kind: "name_change"; client_id: string; action: "approve" | "reject" }
  | { kind: "sewing_session"; request_id: string; action: "approve" | "reject" }
  | { kind: "fabric_line_delete"; order_id: string; line_id: string; action: "approve" | "reject" };

type RowState = "pending" | "busy" | "approved" | "rejected" | "failed";

type UnifiedRow = {
  key: string;
  section: string;
  title: string;
  subtitle: string;
  meta: string;
  decision: (action: "approve" | "reject") => Decision;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Riyadh",
    });
  } catch {
    return iso;
  }
}

export function AdminApprovalsClient({
  token,
  adminEmail,
  nameChanges,
  sewingRequests,
  fabricLineDeletes,
}: {
  token: string;
  adminEmail: string;
  nameChanges: NameChangeRow[];
  sewingRequests: SewingRow[];
  fabricLineDeletes: FabricDeleteRow[];
}) {
  const rows = useMemo<UnifiedRow[]>(() => {
    const list: UnifiedRow[] = [];
    for (const row of nameChanges) {
      list.push({
        key: `name_change:${row.client_id}`,
        section: "Client name changes",
        title: `${row.current_name} (${row.client_code})`,
        subtitle: `New name: ${row.proposed_name}`,
        meta: `by ${row.requested_by} - ${formatWhen(row.requested_at)}`,
        decision: (action) => ({ kind: "name_change", client_id: row.client_id, action }),
      });
    }
    for (const row of sewingRequests) {
      list.push({
        key: `sewing_session:${row.id}`,
        section: "Stitch kiosk requests",
        title: row.label,
        subtitle: [row.employee_name, row.so_number, row.reason].filter(Boolean).join(" - "),
        meta: `by ${row.requested_by} - ${formatWhen(row.requested_at)}`,
        decision: (action) => ({ kind: "sewing_session", request_id: row.id, action }),
      });
    }
    for (const row of fabricLineDeletes) {
      list.push({
        key: `fabric_line_delete:${row.order_id}:${row.line_id}`,
        section: "Fabric line delete requests",
        title: `${row.so_number} ${row.article_label} - ${row.fabric_number} (${row.garment_type})`,
        subtitle: [row.client_name, row.reason].filter(Boolean).join(" - "),
        meta: `by ${row.requested_by} - ${formatWhen(row.requested_at)}`,
        decision: (action) => ({
          kind: "fabric_line_delete",
          order_id: row.order_id,
          line_id: row.line_id,
          action,
        }),
      });
    }
    return list;
  }, [nameChanges, sewingRequests, fabricLineDeletes]);

  const [states, setStates] = useState<Record<string, RowState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  const openRows = rows.filter(
    (row) => (states[row.key] ?? "pending") === "pending" || states[row.key] === "failed"
  );
  const allSelected = openRows.length > 0 && openRows.every((row) => selected.has(row.key));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(openRows.map((row) => row.key)));
  }

  async function applyDecisions(decisions: Decision[], keys: string[], action: "approve" | "reject") {
    setStates((prev) => {
      const next = { ...prev };
      for (const key of keys) next[key] = "busy";
      return next;
    });
    try {
      const res = await fetch("/api/admin-approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, decisions }),
      });
      const data = (await res.json()) as {
        results?: Array<{ key: string; ok: boolean; error?: string }>;
        error?: string;
      };
      if (!res.ok || !data.results) throw new Error(data.error ?? "Failed to apply.");
      setStates((prev) => {
        const next = { ...prev };
        for (const result of data.results!) {
          next[result.key] = result.ok ? (action === "approve" ? "approved" : "rejected") : "failed";
        }
        return next;
      });
      setErrors((prev) => {
        const next = { ...prev };
        for (const result of data.results!) {
          if (!result.ok) next[result.key] = result.error ?? "Failed.";
          else delete next[result.key];
        }
        return next;
      });
      setSelected(new Set());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply.";
      setStates((prev) => {
        const next = { ...prev };
        for (const key of keys) next[key] = "failed";
        return next;
      });
      setErrors((prev) => {
        const next = { ...prev };
        for (const key of keys) next[key] = message;
        return next;
      });
    }
  }

  async function actOne(row: UnifiedRow, action: "approve" | "reject") {
    await applyDecisions([row.decision(action)], [row.key], action);
  }

  async function actSelected(action: "approve" | "reject") {
    const targets = openRows.filter((row) => selected.has(row.key));
    if (targets.length === 0) return;
    setBatchBusy(true);
    await applyDecisions(
      targets.map((row) => row.decision(action)),
      targets.map((row) => row.key),
      action
    );
    setBatchBusy(false);
  }

  const sections = [...new Set(rows.map((row) => row.section))];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-lg space-y-4">
        <header>
          <h1 className="text-xl font-semibold text-slate-900">Admin approvals</h1>
          <p className="mt-1 text-sm text-slate-500">
            Acting as {adminEmail}. Decisions apply immediately and notify the requester.
          </p>
        </header>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-sm font-medium text-emerald-700">Nothing pending.</p>
            <p className="mt-1 text-xs text-slate-500">All admin requests are handled.</p>
          </div>
        ) : (
          <>
            <div className="sticky top-2 z-10 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <label className="flex min-h-[44px] flex-1 items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-5 w-5 rounded border-slate-300"
                />
                Select all ({openRows.length})
              </label>
              <button
                type="button"
                disabled={batchBusy || selected.size === 0}
                onClick={() => void actSelected("approve")}
                className="min-h-[44px] rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Approve ({selected.size})
              </button>
              <button
                type="button"
                disabled={batchBusy || selected.size === 0}
                onClick={() => void actSelected("reject")}
                className="min-h-[44px] rounded-lg bg-white px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 disabled:opacity-40"
              >
                Reject
              </button>
            </div>

            {sections.map((section) => (
              <section key={section} className="space-y-2">
                <h2 className="px-1 text-sm font-semibold text-slate-800">{section}</h2>
                {rows
                  .filter((row) => row.section === section)
                  .map((row) => {
                    const state = states[row.key] ?? "pending";
                    const done = state === "approved" || state === "rejected";
                    return (
                      <div
                        key={row.key}
                        className={`rounded-xl border p-3 ${
                          state === "approved"
                            ? "border-emerald-200 bg-emerald-50"
                            : state === "rejected"
                              ? "border-slate-200 bg-slate-100"
                              : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {!done ? (
                            <input
                              type="checkbox"
                              checked={selected.has(row.key)}
                              onChange={(e) => {
                                setSelected((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(row.key);
                                  else next.delete(row.key);
                                  return next;
                                });
                              }}
                              className="mt-1 h-5 w-5 rounded border-slate-300"
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900">{row.title}</p>
                            {row.subtitle ? (
                              <p className="mt-0.5 text-sm text-slate-600">{row.subtitle}</p>
                            ) : null}
                            <p className="mt-0.5 text-xs text-slate-400">{row.meta}</p>
                            {errors[row.key] ? (
                              <p className="mt-1 text-xs text-red-600">{errors[row.key]}</p>
                            ) : null}
                          </div>
                        </div>
                        {done ? (
                          <p
                            className={`mt-2 text-sm font-semibold ${
                              state === "approved" ? "text-emerald-700" : "text-slate-600"
                            }`}
                          >
                            {state === "approved" ? "Approved" : "Rejected"}
                          </p>
                        ) : (
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              disabled={state === "busy"}
                              onClick={() => void actOne(row, "approve")}
                              className="min-h-[44px] flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              {state === "busy" ? "Working..." : "Approve"}
                            </button>
                            <button
                              type="button"
                              disabled={state === "busy"}
                              onClick={() => void actOne(row, "reject")}
                              className="min-h-[44px] flex-1 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </section>
            ))}
          </>
        )}
        <p className="pb-6 text-center text-xs text-slate-400">
          Garment ERP - this link works for 7 days without login.
        </p>
      </div>
    </main>
  );
}
