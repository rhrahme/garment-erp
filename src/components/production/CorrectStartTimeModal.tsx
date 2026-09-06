"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { utcMsToRiyadhDateTimeLocal } from "@/lib/production/stitch-kiosk-lunch";
import { sewingSessionEmployeeDisplayName } from "@/lib/production/sewing-session-status-label";
import type { SewingSession } from "@/lib/types/sewing-sessions";

export function CorrectStartTimeModal({
  open,
  session,
  onClose,
  onCorrected,
}: {
  open: boolean;
  session: SewingSession | null;
  onClose: () => void;
  onCorrected: (startedAt: string) => void;
}) {
  const [startedAt, setStartedAt] = useState("");
  const [reason, setReason] = useState("QR was not ready. Stitcher started earlier.");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !session) return;
    setError(null);
    setStartedAt(utcMsToRiyadhDateTimeLocal(Date.parse(session.started_at) || Date.now()));
    setReason("QR was not ready. Stitcher started earlier.");
  }, [open, session]);

  if (!open || !session) return null;

  async function submit() {
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/production/sewing-session/correct-start-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session.id,
          started_at: startedAt,
          reason: reason.trim() || null,
        }),
      });
      const data = (await res.json()) as { error?: string; started_at?: string };
      if (!res.ok || !data.started_at) {
        throw new Error(data.error ?? "Failed to correct start time.");
      }
      onCorrected(data.started_at);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to correct start time.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Correct start time</h3>
        <p className="mt-1 text-sm text-slate-600">
          The scan time is already on the session. Change it to when they really started.
          Work keeps running. Admin gets a request; Confirm or Reject does not stop them.
        </p>

        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <div className="font-mono">{session.production_code}</div>
          <div>
            {sewingSessionEmployeeDisplayName(session)}
            {session.fabric_number ? ` | fabric ${session.fabric_number}` : ""}
          </div>
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Real start time (Riyadh)
          <input
            type="datetime-local"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base"
            value={startedAt}
            onChange={(event) => setStartedAt(event.target.value)}
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-700">
          Reason
          <textarea
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-base"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>

        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={saving || !startedAt} onClick={() => void submit()}>
            {saving ? "Saving..." : "Save time and notify admin"}
          </Button>
        </div>
      </div>
    </div>
  );
}
