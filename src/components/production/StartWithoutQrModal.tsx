"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { utcMsToRiyadhDateTimeLocal } from "@/lib/production/stitch-kiosk-lunch";
import type { SewingSession } from "@/lib/types/sewing-sessions";

type PieceOption = {
  production_code: string;
  so_number: string;
  client_name: string;
  fabric_number: string;
  garment_type: string;
  piece_mark: string | null;
};

type EmployeeOption = {
  id: string;
  employee_id_number: string;
  full_name: string;
};

type StartWithoutQrModalProps = {
  open: boolean;
  kioskId: string;
  workstationId?: string | null;
  defaultEmployeeId?: string | null;
  defaultEmployeeName?: string | null;
  onClose: () => void;
  onStarted: (session: SewingSession) => void;
};

export function StartWithoutQrModal({
  open,
  kioskId,
  workstationId,
  defaultEmployeeId,
  defaultEmployeeName,
  onClose,
  onStarted,
}: StartWithoutQrModalProps) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId ?? "");
  const [query, setQuery] = useState("");
  const [pieces, setPieces] = useState<PieceOption[]>([]);
  const [productionCode, setProductionCode] = useState("");
  const [startedAt, setStartedAt] = useState(() => utcMsToRiyadhDateTimeLocal(Date.now()));
  const [reason, setReason] = useState("");
  const [loadingPieces, setLoadingPieces] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setQuery("");
    setPieces([]);
    setProductionCode("");
    setStartedAt(utcMsToRiyadhDateTimeLocal(Date.now()));
    setReason("");
    setEmployeeId(defaultEmployeeId ?? "");
  }, [open, defaultEmployeeId]);

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => {
      setLoadingPieces(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      void fetch(`/api/production/sewing-session/start-without-qr?${params}`)
        .then((res) => res.json())
        .then((data: { pieces?: PieceOption[]; employees?: EmployeeOption[]; error?: string }) => {
          if (data.error) throw new Error(data.error);
          setPieces(data.pieces ?? []);
          if (data.employees) setEmployees(data.employees);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Failed to search pieces.");
        })
        .finally(() => setLoadingPieces(false));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [open, query]);

  const selected = useMemo(
    () => pieces.find((row) => row.production_code === productionCode) ?? null,
    [pieces, productionCode]
  );

  if (!open) return null;

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/production/sewing-session/start-without-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kiosk_id: kioskId,
          workstation_id: workstationId || null,
          employee_id: employeeId || null,
          production_code: productionCode,
          started_at: startedAt,
          reason: reason.trim() || null,
        }),
      });
      const data = (await res.json()) as { error?: string; session?: SewingSession };
      if (!res.ok || !data.session) {
        throw new Error(data.error ?? "Failed to start.");
      }
      onStarted(data.session);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <h3 className="text-lg font-semibold text-slate-900">QR not ready - start anyway</h3>
        <p className="mt-1 text-sm text-slate-600">
          Session starts now with the time they began. Admin is notified. Work
          keeps running even before Confirm.
        </p>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Stitcher
          <select
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
          >
            <option value="">
              {defaultEmployeeName ? `${defaultEmployeeName} (last badge)` : "Select employee"}
            </option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name} ({employee.employee_id_number})
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-700">
          Search client / SO / fabric / piece
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Client name, SO-2026-..., fabric #, L04"
            data-stitch-manual-entry="true"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-700">
          Garment / piece
          <select
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base"
            value={productionCode}
            onChange={(event) => setProductionCode(event.target.value)}
          >
            <option value="">{loadingPieces ? "Searching..." : "Select piece"}</option>
            {pieces.map((piece) => (
              <option key={piece.production_code} value={piece.production_code}>
                {piece.client_name} - {piece.so_number} - {piece.garment_type} -{" "}
                {piece.fabric_number} - {piece.production_code}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <p className="mt-1 text-xs text-slate-600">
            {selected.client_name} ({selected.so_number}) - {selected.garment_type}{" "}
            {selected.fabric_number}
          </p>
        ) : null}

        <label className="mt-3 block text-sm font-medium text-slate-700">
          Time they started (Riyadh)
          <input
            type="datetime-local"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base"
            value={startedAt}
            onChange={(event) => setStartedAt(event.target.value)}
            data-stitch-manual-entry="true"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-700">
          Reason (optional)
          <textarea
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-base"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="QR not printed yet - already stitching"
            data-stitch-manual-entry="true"
          />
        </label>

        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || !productionCode}
            onClick={() => void submit()}
          >
            {saving ? "Starting..." : "Start and notify admin"}
          </Button>
        </div>
      </div>
    </div>
  );
}
