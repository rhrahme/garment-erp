"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";

export const MASKED_INVOICE_AMOUNT = "SAR ••••••";

type InvoiceAmountsRevealToggleProps = {
  visible: boolean;
  onUnlock: () => void;
  onLock: () => void;
};

export function InvoiceAmountsRevealToggle({ visible, onUnlock, onLock }: InvoiceAmountsRevealToggleProps) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revealAmounts(event: React.FormEvent) {
    event.preventDefault();
    if (!password.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/invoice-amounts/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Incorrect password");

      onUnlock();
      setOpen(false);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect password");
    } finally {
      setSubmitting(false);
    }
  }

  function closeModal() {
    if (submitting) return;
    setOpen(false);
    setPassword("");
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (visible ? onLock() : setOpen(true))}
        disabled={submitting}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        title={visible ? "Hide invoice totals" : "Show invoice totals"}
        aria-label={visible ? "Hide invoice totals" : "Show invoice totals"}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        {visible ? "Hide" : "Show"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-labelledby="invoice-amounts-access-title"
          >
            <h2 id="invoice-amounts-access-title" className="text-lg font-semibold text-slate-900">
              View invoice totals
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Outstanding and paid amounts are hidden for privacy. Enter the password to reveal them.
            </p>

            <form onSubmit={(event) => void revealAmounts(event)} className="mt-4">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Enter password"
                  autoComplete="current-password"
                  autoFocus
                  disabled={submitting}
                />
              </label>

              {error && (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={closeModal} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting || !password.trim()}>
                  {submitting ? "Checking…" : "Show amounts"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
