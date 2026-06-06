"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";

type FabricPriceRevealToggleProps = {
  canViewFabricPrices: boolean;
  compact?: boolean;
};

export function FabricPriceRevealToggle({
  canViewFabricPrices,
  compact = false,
}: FabricPriceRevealToggleProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function hidePrices() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/fabric-prices/lock", { method: "POST" });
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
    if (!code.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/fabric-prices/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Invalid access code");

      setOpen(false);
      setCode("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid access code");
    } finally {
      setSubmitting(false);
    }
  }

  function closeModal() {
    if (submitting) return;
    setOpen(false);
    setCode("");
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (canViewFabricPrices ? void hidePrices() : setOpen(true))}
        disabled={submitting}
        className={
          compact
            ? "inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            : "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        }
        title={canViewFabricPrices ? "Hide fabric prices" : "Show fabric prices"}
        aria-label={canViewFabricPrices ? "Hide fabric prices" : "Show fabric prices"}
      >
        {canViewFabricPrices ? (
          <>
            <EyeOff className="h-4 w-4" />
            {!compact && "Hide prices"}
          </>
        ) : (
          <>
            <Eye className="h-4 w-4" />
            {!compact && "Show prices"}
          </>
        )}
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
              Fabric list prices are restricted. Enter the access code to show them on this order.
            </p>

            <form onSubmit={(event) => void revealPrices(event)} className="mt-4">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Access code</span>
                <input
                  type="password"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                  placeholder="Enter code"
                  autoComplete="off"
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
                <Button type="submit" disabled={submitting || !code.trim()}>
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
  return <span className="text-slate-400">Hidden</span>;
}
