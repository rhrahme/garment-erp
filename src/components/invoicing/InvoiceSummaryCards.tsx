"use client";

import { FileText, Wallet } from "lucide-react";
import { StatCard } from "@/components/ui/PageHeader";
import type { CustomerInvoiceSummary } from "@/lib/types/customer-invoices";
import { formatInvoiceSar } from "@/lib/invoicing/format-amount";
import {
  InvoiceAmountsRevealToggle,
  MASKED_INVOICE_AMOUNT,
} from "@/components/invoicing/InvoiceAmountsRevealToggle";
import { useInvoiceAmountsVisibility } from "@/hooks/useInvoiceAmountsVisibility";

export function InvoiceSummaryCards({
  summary,
  canToggleAmounts = false,
  amountsVisibleByDefault = false,
  revealWithoutPassword = false,
}: {
  summary: CustomerInvoiceSummary;
  /** Show eye toggle (sales + accounting). */
  canToggleAmounts?: boolean;
  /** Admin always visible; accounting starts visible. */
  amountsVisibleByDefault?: boolean;
  /** Accounting — no password to reveal. */
  revealWithoutPassword?: boolean;
}) {
  const { visible, hydrated, unlock, lock } = useInvoiceAmountsVisibility(amountsVisibleByDefault);

  const alwaysShowAmounts = amountsVisibleByDefault && !canToggleAmounts;
  const showAmounts = alwaysShowAmounts || (hydrated && visible);
  const outstandingValue = showAmounts ? formatInvoiceSar(summary.outstanding_sar) : MASKED_INVOICE_AMOUNT;
  const paidValue = showAmounts ? formatInvoiceSar(summary.paid_sar) : MASKED_INVOICE_AMOUNT;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        {canToggleAmounts && hydrated && (
          <InvoiceAmountsRevealToggle
            visible={visible}
            onUnlock={unlock}
            onLock={lock}
            skipPassword={revealWithoutPassword}
          />
        )}
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
