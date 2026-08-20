"use client";

import { useState } from "react";
import { ClientTitleSelect } from "@/components/clients/ClientTitleSelect";
import { Button } from "@/components/ui/Button";
import { formatClientDisplayName } from "@/lib/clients/names";
import type { ClientProfile } from "@/lib/types/clients";

export function ClientNameChangeRequestForm({
  client,
  onUpdated,
  defaultOpen = false,
}: {
  client: ClientProfile;
  onUpdated?: (client: ClientProfile) => void;
  defaultOpen?: boolean;
}) {
  const pending = Boolean(client.name_change_requested_at);
  const [open, setOpen] = useState(defaultOpen && !pending);
  const [title, setTitle] = useState<string | null>(client.title ?? null);
  const [firstName, setFirstName] = useState(client.first_name);
  const [middleName, setMiddleName] = useState(client.middle_name ?? "");
  const [lastName, setLastName] = useState(client.last_name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const proposedName = formatClientDisplayName({
    title: client.name_change_title ?? null,
    first_name: client.name_change_first_name ?? "",
    middle_name: client.name_change_middle_name ?? null,
    last_name: client.name_change_last_name ?? "",
  });

  function startRequest() {
    setTitle(client.title ?? null);
    setFirstName(client.first_name);
    setMiddleName(client.middle_name ?? "");
    setLastName(client.last_name);
    setError(null);
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(client.id)}/name-change-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_change",
          title,
          first_name: firstName,
          middle_name: middleName.trim() || null,
          last_name: lastName,
        }),
      });
      const data = (await res.json()) as { client?: ClientProfile; error?: string };
      if (!res.ok || !data.client) {
        throw new Error(data.error ?? "Failed to send the name change request.");
      }
      onUpdated?.(data.client);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send the name change request.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelPending() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(client.id)}/name-change-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_request" }),
      });
      const data = (await res.json()) as { client?: ClientProfile; error?: string };
      if (!res.ok || !data.client) {
        throw new Error(data.error ?? "Failed to cancel the request.");
      }
      onUpdated?.(data.client);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel the request.");
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <p className="font-medium">Name change waiting for admin approval</p>
        <p className="mt-0.5 text-xs">
          Proposed: <span className="font-medium">{proposedName}</span>
          {client.name_change_requested_by ? ` · requested by ${client.name_change_requested_by}` : ""}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 text-amber-800 hover:bg-amber-100"
          disabled={busy}
          onClick={() => void cancelPending()}
        >
          Cancel request
        </Button>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <div>
        <Button variant="secondary" size="sm" onClick={startRequest}>
          Request name edit
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
      <p className="text-xs font-medium text-indigo-900">
        Propose a new name — an admin gets notified and approves it before it applies.
      </p>
      <div className="mt-2 grid gap-2 md:grid-cols-[7rem_1fr_1fr_1fr]">
        <ClientTitleSelect
          value={title}
          onChange={setTitle}
          className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
          className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          autoComplete="off"
        />
        <input
          value={middleName}
          onChange={(e) => setMiddleName(e.target.value)}
          placeholder="Middle (optional)"
          className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          autoComplete="off"
        />
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name"
          className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          autoComplete="off"
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => void submit()}>
          {busy ? "Sending…" : "Send to admin for approval"}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
