"use client";

import { FileText, Wallet } from "lucide-react";
import { StatCard } from "@/components/ui/PageHeader";
import type { CustomerInvoiceSummary } from "@/lib/types/customer-invoices";
import { formatInvoiceSar } from "@/lib/invoicing/format-amount";
import {
  InvoiceAmountsRevealToggle,
  MASKED_INVOICE_AMOUNT,
} from "@/components/invoicing/InvoiceAmountsRevealToggle";

export function InvoiceSummaryCards({
  summary,
  canToggleAmounts = false,
  showAmounts = false,
  amountsVisible = false,
  amountsHydrated = false,
  onUnlock,
  onLock,
  revealWithoutPassword = false,
}: {
  summary: CustomerInvoiceSummary;
  /** Show eye toggle (admin + sales + accounting). */
  canToggleAmounts?: boolean;
  /** Whether monetary values are currently revealed. */
  showAmounts?: boolean;
  /** Eye toggle pressed state (same as showAmounts when toggle is active). */
  amountsVisible?: boolean;
  amountsHydrated?: boolean;
  onUnlock?: () => void;
  onLock?: () => void;
  /** Admin / accounting — no password to reveal. */
  revealWithoutPassword?: boolean;
}) {
  const outstandingValue = showAmounts ? formatInvoiceSar(summary.outstanding_sar) : MASKED_INVOICE_AMOUNT;
  const paidValue = showAmounts ? formatInvoiceSar(summary.paid_sar) : MASKED_INVOICE_AMOUNT;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        {canToggleAmounts && amountsHydrated && onUnlock && onLock ? (
          <InvoiceAmountsRevealToggle
            visible={amountsVisible}
            onUnlock={onUnlock}
            onLock={onLock}
            skipPassword={revealWithoutPassword}
          />
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Invoices"
          value={summary.invoice_count}
          subtext={`${summary.draft_count} draft`}
          icon={<FileText className="h-5 w-5" />}
          accent="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          label="Outstanding"
          value={outstandingValue}
          subtext={`${summary.sent_count} sent · ${summary.draft_count} draft`}
          icon={<Wallet className="h-5 w-5" />}
          accent="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Paid"
          value={paidValue}
          subtext={`${summary.paid_count} invoice${summary.paid_count !== 1 ? "s" : ""}`}
          accent="bg-emerald-50 text-emerald-600"
        />
        <StatCard label="Currency" value="SAR" subtext="Client billing" accent="bg-sky-50 text-sky-600" />
      </div>
    </div>
  );
}
