"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type {
  SewingSessionChangeAction,
  SewingSessionEditPatch,
} from "@/lib/types/sewing-session-change-requests";
import type { SewingScanFailure } from "@/lib/types/sewing-scan-failures";
import type { SewingSession } from "@/lib/types/sewing-sessions";

export type PendingChangeSummary = {
  id: string;
  action: SewingSessionChangeAction;
  session_id: string | null;
  failure_id: string | null;
  label: string;
};

type Target =
  | { kind: "session"; session: SewingSession; live: boolean }
  | { kind: "failure"; failure: SewingScanFailure }
  | { kind: "kiosk" };

type SewingSessionChangeRequestModalProps = {
  open: boolean;
  target: Target | null;
  onClose: () => void;
  onSubmitted: (request: PendingChangeSummary) => void;
};

const SESSION_ACTIONS_LIVE: { id: SewingSessionChangeAction; label: string }[] = [
  { id: "stop", label: "Stop (force close)" },
  { id: "delete", label: "Delete" },
  { id: "edit", label: "Edit" },
];

const SESSION_ACTIONS_HISTORY: { id: SewingSessionChangeAction; label: string }[] = [
  { id: "delete", label: "Delete" },
  { id: "edit", label: "Edit" },
];

export function SewingSessionChangeRequestModal({
  open,
  target,
  onClose,
  onSubmitted,
}: SewingSessionChangeRequestModalProps) {
  const [action, setAction] = useState<SewingSessionChangeAction>("delete");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [patch, setPatch] = useState<SewingSessionEditPatch>({});

  useEffect(() => {
    if (!open || !target) return;
    setError(null);
    setReason("");
    setPatch({});
    if (target.kind === "session") {
      setAction(target.live ? "stop" : "delete");
    }
  }, [open, target]);

  if (!open || !target) return null;

  const sessionActions =
    target.kind === "session"
      ? target.live
        ? SESSION_ACTIONS_LIVE
        : SESSION_ACTIONS_HISTORY
      : [];

  async function submit() {
    const currentTarget = target;
    if (!currentTarget) return;
    setSaving(true);
    setError(null);
    try {
      const requestAction: SewingSessionChangeAction =
        currentTarget.kind === "kiosk"
          ? "pause_kiosk"
          : currentTarget.kind === "failure"
            ? "delete_failure"
            : action;

      const body: Record<string, unknown> = {
        action: "request",
        request_action: requestAction,
        reason: reason.trim() || null,
      };
      if (currentTarget.kind === "session") body.session_id = currentTarget.session.id;
      if (currentTarget.kind === "failure") body.failure_id = currentTarget.failure.id;
      if (requestAction === "edit") body.proposed_patch = patch;

      const res = await fetch("/api/production/sewing-session/change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string; request?: PendingChangeSummary };
      if (!res.ok || !data.request) {
        throw new Error(data.error ?? "Failed to submit request.");
      }
      onSubmitted(data.request);
      setReason("");
      setPatch({});
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit request.");
    } finally {
      setSaving(false);
    }
  }

  const title =
    target.kind === "kiosk"
      ? "Request pause stitch kiosk"
      : target.kind === "failure"
        ? "Request delete failed scan"
        : "Request session change";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
      >
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">
          Admin must Confirm or Reject before anything changes.
        </p>

        {target.kind === "session" ? (
          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <div className="font-mono">{target.session.production_code}</div>
            <div>
              {target.session.employee_name}
              {target.session.fabric_number ? ` | fabric ${target.session.fabric_number}` : ""}
            </div>
          </div>
        ) : null}
        {target.kind === "failure" ? (
          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <div className="font-mono">{target.failure.raw_code}</div>
            <div>{target.failure.reason}</div>
          </div>
        ) : null}

        {target.kind === "session" ? (
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Action
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base"
              value={action}
              onChange={(event) => setAction(event.target.value as SewingSessionChangeAction)}
            >
              {sessionActions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {target.kind === "session" && action === "edit" ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(
              [
                ["employee_id_number", "Employee ID"],
                ["production_code", "Production code"],
                ["scan_code", "Scan code"],
                ["piece_mark", "Piece mark"],
                ["fabric_number", "Fabric"],
                ["garment_type", "Garment"],
                ["client_name", "Client"],
                ["started_at", "Started at (ISO)"],
                ["ended_at", "Ended at (ISO)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-xs font-medium text-slate-600">
                {label}
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  defaultValue={
                    key === "employee_id_number"
                      ? target.session.employee_id_number ?? ""
                      : key === "production_code"
                        ? target.session.production_code
                        : key === "scan_code"
                          ? target.session.scan_code
                          : key === "piece_mark"
                            ? target.session.piece_mark ?? ""
                            : key === "fabric_number"
                              ? target.session.fabric_number ?? ""
                              : key === "garment_type"
                                ? target.session.garment_type ?? ""
                                : key === "client_name"
                                  ? target.session.client_name ?? ""
                                  : key === "started_at"
                                    ? target.session.started_at
                                    : target.session.ended_at ?? ""
                  }
                  onChange={(event) =>
                    setPatch((prev) => ({ ...prev, [key]: event.target.value }))
                  }
                />
              </label>
            ))}
          </div>
        ) : null}

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Reason (optional)
          <textarea
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-base"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why should admin approve this?"
          />
        </label>

        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => void submit()}>
            {saving ? "Sending..." : "Send to admin"}
          </Button>
        </div>
      </div>
    </div>
  );
}
