"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MASKED_FABRIC_COST, MASKED_FABRIC_PRICE } from "@/lib/auth/fabric-price.constants";

type FabricPriceRevealToggleProps = {
  canViewFabricPrices: boolean;
  compact?: boolean;
  iconOnly?: boolean;
};

export function FabricPriceRevealToggle({
  canViewFabricPrices,
  compact = false,
  iconOnly = false,
}: FabricPriceRevealToggleProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function hidePrices() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/fabric-prices/lock", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to hide prices");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hide prices");
    } finally {
      setSubmitting(false);
    }
  }

  async function revealPrices(event: React.FormEvent) {
    event.preventDefault();
    if (!password.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/fabric-prices/unlock", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Incorrect password");

      setOpen(false);
      setPassword("");
      router.refresh();
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
        onClick={() => (canViewFabricPrices ? void hidePrices() : setOpen(true))}
        disabled={submitting}
        className={
          iconOnly
            ? "inline-flex shrink-0 items-center justify-center rounded-lg border border-emerald-300 bg-white p-1.5 text-emerald-800 shadow-sm hover:bg-emerald-50 disabled:opacity-50"
            : compact
              ? "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              : "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        }
        title={canViewFabricPrices ? "Hide fabric prices" : "Show fabric prices"}
        aria-label={canViewFabricPrices ? "Hide fabric prices" : "Show fabric prices"}
      >
        {canViewFabricPrices ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        {!iconOnly && (canViewFabricPrices ? "Hide" : "Show")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-labelledby="fabric-price-access-title"
          >
            <h2 id="fabric-price-access-title" className="text-lg font-semibold text-slate-900">
              View fabric prices
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Fabric prices and cost totals are hidden for privacy. Enter the password to reveal them.
            </p>

            <form onSubmit={(event) => void revealPrices(event)} className="mt-4">
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
                  {submitting ? "Checking…" : "Show prices"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export function MaskedFabricPrice() {
  return <span className="text-slate-400">{MASKED_FABRIC_PRICE}</span>;
}

export function MaskedFabricCost() {
  return <span className="text-slate-400">{MASKED_FABRIC_COST}</span>;
}
