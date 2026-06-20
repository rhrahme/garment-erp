"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function CreateInvoiceButton({
  salesOrderId,
  existingInvoiceId,
  isReadyMade,
}: {
  salesOrderId: string;
  existingInvoiceId: string | null;
  isReadyMade: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isReadyMade) return null;

  if (existingInvoiceId) {
    return (
      <Link href={`/invoices/${existingInvoiceId}`}>
        <Button variant="secondary">View invoice</Button>
      </Link>
    );
  }

  async function createInvoice() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/customer-invoices/from-sales-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales_order_id: salesOrderId }),
      });
      const data = (await res.json()) as {
        id?: string;
        error?: string;
        invoice?: { id: string };
      };
      if (res.status === 409 && data.invoice?.id) {
        router.push(`/invoices/${data.invoice.id}`);
        router.refresh();
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Failed to create invoice.");
      router.push(`/invoices/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <Button onClick={() => void createInvoice()} disabled={creating}>
        {creating ? "Creating…" : "Create invoice"}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
