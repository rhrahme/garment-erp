"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, LogOut, ScanLine, UserRound } from "lucide-react";
import { EmployeeBadgeSelect } from "@/components/production/EmployeeBadgeSelect";
import { FACTORY_WORKSTATIONS } from "@/lib/production/factory-workstations";
import { normalizeScannerInput, splitScanInput } from "@/lib/production/scan-input";
import {
  clearScanEmployeeSession,
  createScanEmployeeSession,
  effectiveWorkstationId,
  readScanEmployeeSession,
  sessionNeedsWorkstationPick,
  writeScanEmployeeSession,
  type ScanEmployeeSession,
} from "@/lib/production/scan-employee-session";
import { cn } from "@/lib/utils";

const SCAN_BURST_IDLE_MS = 220;

type EmployeeLookupResponse = {
  employee: {
    id: string;
    employee_id_number: string;
    full_name: string;
    assigned_workstation_id: string | null;
    is_mobile_floater: boolean;
    needs_workstation_pick: boolean;
  };
};

type EmployeeScanSessionProps = {
  onSessionChange: (session: ScanEmployeeSession | null) => void;
};

export function EmployeeScanSession({ onSessionChange }: EmployeeScanSessionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const flushTimerRef = useRef<number | null>(null);
  const [session, setSession] = useState<ScanEmployeeSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [workstationPick, setWorkstationPick] = useState("");

  const syncSession = useCallback(
    (next: ScanEmployeeSession | null) => {
      setSession(next);
      onSessionChange(next);
    },
    [onSessionChange]
  );

  useEffect(() => {
    const existing = readScanEmployeeSession();
    syncSession(existing);
  }, [syncSession]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    };
  }, []);

  const focusInput = useCallback(() => {
    if (!session) inputRef.current?.focus({ preventScroll: true });
  }, [session]);

  useEffect(() => {
    focusInput();
  }, [focusInput, session]);

  async function lookupBadge(code: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/employee-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Badge not recognized");

      const payload = data as EmployeeLookupResponse;
      const next = createScanEmployeeSession({
        employee_id: payload.employee.id,
        employee_name: payload.employee.full_name,
        employee_id_number: payload.employee.employee_id_number,
        assigned_workstation_id: payload.employee.assigned_workstation_id,
        is_mobile_floater: payload.employee.is_mobile_floater,
      });
      writeScanEmployeeSession(next);
      syncSession(next);
      setWorkstationPick("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Badge scan failed");
    } finally {
      setLoading(false);
      focusInput();
    }
  }

  function submitBadge(raw: string) {
    const codes = splitScanInput(raw);
    const code = codes[0];
    if (!code) return;
    void lookupBadge(code);
  }

  function captureAndClearInput(): string {
    const el = inputRef.current;
    if (!el) return "";
    const raw = normalizeScannerInput(el.value);
    el.value = "";
    return raw;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      submitBadge(captureAndClearInput());
      return;
    }
    if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(() => {
      const pending = normalizeScannerInput(inputRef.current?.value ?? "");
      if (pending.length >= 6) submitBadge(captureAndClearInput());
    }, SCAN_BURST_IDLE_MS);
  }

  function logout() {
    clearScanEmployeeSession();
    syncSession(null);
    setError(null);
    setWorkstationPick("");
  }

  function confirmWorkstationPick() {
    if (!session || !workstationPick) return;
    const next: ScanEmployeeSession = {
      ...session,
      workstation_override_id: workstationPick,
    };
    writeScanEmployeeSession(next);
    syncSession(next);
  }

  const workstationId = session ? effectiveWorkstationId(session) : null;
  const needsPick = session ? sessionNeedsWorkstationPick(session) : false;

  if (session) {
    return (
      <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-lg bg-emerald-600 p-2 text-white">
              <UserRound className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Step 1 complete</p>
              <p className="text-lg font-semibold text-slate-900">{session.employee_name}</p>
              <p className="text-sm text-slate-600">
                ID {session.employee_id_number}
                {workstationId ? (
                  <>
                    {" "}
                    · Station <span className="font-mono font-medium text-emerald-900">{workstationId}</span>
                  </>
                ) : (
                  " · No station assigned"
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>

        {needsPick && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-sm font-medium text-amber-950">Pick your workstation for this shift</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <select
                value={workstationPick}
                onChange={(e) => setWorkstationPick(e.target.value)}
                className="min-w-[12rem] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select machine…</option>
                {FACTORY_WORKSTATIONS.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={confirmWorkstationPick}
                disabled={!workstationPick}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Confirm station
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-violet-300 bg-violet-50/50 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-violet-600 p-2.5 text-white">
          <ScanLine className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-slate-900">Step 1 — Scan or select your badge</h3>
          <p className="mt-1 text-sm text-slate-600">
            Scan your employee QR badge or pick your name from the list below. Your session stays active for 8 hours on
            this device.
          </p>

          <div
            className={cn(
              "relative mt-4 w-full cursor-pointer rounded-xl border-2 border-dashed bg-white py-8 text-center shadow-sm transition-colors",
              isFocused ? "border-emerald-500 ring-4 ring-emerald-100" : "border-violet-400 ring-4 ring-violet-100"
            )}
            onPointerDown={() => inputRef.current?.focus({ preventScroll: true })}
            role="button"
            tabIndex={-1}
          >
            {loading ? (
              <span className="pointer-events-none inline-flex items-center gap-2 text-base font-semibold text-violet-700">
                <Loader2 className="h-5 w-5 animate-spin" />
                Checking badge…
              </span>
            ) : isFocused ? (
              <span className="pointer-events-none text-base font-semibold text-emerald-700">Ready — scan badge</span>
            ) : (
              <span className="pointer-events-none text-base font-semibold text-amber-700">Click here, then scan badge</span>
            )}
            <input
              ref={inputRef}
              type="text"
              name="employee-badge-scan"
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              className="absolute inset-0 cursor-default opacity-0"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Scan employee badge"
            />
          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <div className="w-full border-t border-violet-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-violet-50/50 px-3 text-xs font-medium uppercase tracking-wide text-violet-700">
                or select from list
              </span>
            </div>
          </div>

          <EmployeeBadgeSelect onSelect={lookupBadge} disabled={loading} loading={loading} />

          {error && (
            <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-900" role="alert">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function stickerScanReady(session: ScanEmployeeSession | null): boolean {
  if (!session) return false;
  return !sessionNeedsWorkstationPick(session);
}
