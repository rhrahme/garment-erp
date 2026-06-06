"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { SalesOrder } from "@/lib/types/sales-orders";

export function DeleteSalesOrderButton({ order }: { order: SalesOrder }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmText.trim() === order.so_number;
  const hasFabricPos = order.fabric_po_ids.length > 0;

  async function handleDelete() {
    if (!canConfirm || hasFabricPos) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${order.id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to delete order");
      router.push("/orders");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete order");
    } finally {
      setDeleting(false);
    }
  }

  function close() {
    if (deleting) return;
    setOpen(false);
    setConfirmText("");
    setError(null);
  }

  return (
    <>
      <Button variant="secondary" className="text-red-700 hover:bg-red-50" onClick={() => setOpen(true)}>
        <Trash2 className="mr-1.5 h-4 w-4" />
        Delete order
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-labelledby="delete-order-title"
          >
            <h2 id="delete-order-title" className="text-lg font-semibold text-slate-900">
              Delete sales order?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              This permanently removes <span className="font-mono font-medium">{order.so_number}</span> for{" "}
              {order.client_name}. Only admins can do this.
            </p>

            {hasFabricPos ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Supplier fabric orders already exist for this sales order — delete those first.
              </p>
            ) : (
              <label className="mt-4 block text-sm">
                <span className="font-medium text-slate-700">
                  Type <span className="font-mono">{order.so_number}</span> to confirm
                </span>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                  placeholder={order.so_number}
                  autoComplete="off"
                />
              </label>
            )}

            {error && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={close} disabled={deleting}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleDelete()}
                disabled={deleting || !canConfirm || hasFabricPos}
                className="bg-red-600 hover:bg-red-700 disabled:bg-red-300"
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
