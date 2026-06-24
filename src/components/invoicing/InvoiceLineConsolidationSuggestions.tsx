"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { formatInvoiceSar } from "@/lib/invoicing/format-amount";
import { toInvoiceLineDisplay } from "@/lib/invoicing/display";
import {
  applyAllInvoiceLineConsolidations,
  applyInvoiceLineConsolidationGroups,
  DEFAULT_MERGE_KEY_FIELDS,
  summarizeInvoiceLineConsolidation,
  type InvoiceLineConsolidationGroup,
} from "@/lib/invoicing/line-consolidation";
import type { CustomerInvoiceLine } from "@/lib/types/customer-invoices";

function GroupPreview({ group }: { group: InvoiceLineConsolidationGroup }) {
  const merged = toInvoiceLineDisplay(group.merged);
  const totalQty = group.lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalAmount = group.lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
      <p className="font-medium text-slate-900">
        {group.lines.length} lines → 1 · {merged.description} · qty {totalQty} @{" "}
        {formatInvoiceSar(group.merged.unit_price)}
      </p>
      <p className="mt-1 text-slate-600">{merged.composition_label}</p>
      <p className="mt-1 text-xs text-slate-500">
        Line total {formatInvoiceSar(totalAmount)} (unchanged)
      </p>
    </div>
  );
}

export function InvoiceLineConsolidationSuggestions({
  lines,
  onApply,
  saving,
}: {
  lines: CustomerInvoiceLine[];
  onApply: (nextLines: CustomerInvoiceLine[]) => Promise<void>;
  saving?: boolean;
}) {
  const summary = useMemo(
    () => summarizeInvoiceLineConsolidation(lines, DEFAULT_MERGE_KEY_FIELDS),
    [lines]
  );

  if (summary.groups.length === 0) return null;

  async function applyGroup(group: InvoiceLineConsolidationGroup) {
    const next = applyInvoiceLineConsolidationGroups(lines, [group]);
    await onApply(next);
  }

  async function applyAll() {
    const next = applyAllInvoiceLineConsolidations(lines, DEFAULT_MERGE_KEY_FIELDS);
    await onApply(next);
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-amber-950">Line consolidation suggestions</h3>
          <p className="mt-1 text-sm text-amber-900">
            {summary.before} lines → {summary.after} possible (
            {summary.groups.length} group{summary.groups.length === 1 ? "" : "s"}) — same garment,
            composition, weight, price, and fabric brand
          </p>
        </div>
        <Button size="sm" onClick={() => void applyAll()} disabled={saving}>
          Apply all
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {summary.groups.map((group) => (
          <div key={group.id} className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <GroupPreview group={group} />
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0"
              onClick={() => void applyGroup(group)}
              disabled={saving}
            >
              Apply
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
