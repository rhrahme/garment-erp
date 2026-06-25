"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { formatInvoiceSar } from "@/lib/invoicing/format-amount";
import { formatInvoiceComposition, formatInvoiceWeight, toInvoiceLineDisplay } from "@/lib/invoicing/display";
import {
  applyAllConsolidations,
  applyConsolidation,
  suggestConsolidationGroups,
  type ConsolidationGroup,
} from "@/lib/invoicing/consolidate-lines";
import type { CustomerInvoiceLine } from "@/lib/types/customer-invoices";

function formatGroupLabel(group: ConsolidationGroup): string {
  const line = group.lines[0]!;
  const display = toInvoiceLineDisplay(line);
  const composition = formatInvoiceComposition(line.composition);
  const weight = line.weight_gsm != null ? formatInvoiceWeight(line.weight_gsm) : "—";
  return `${display.description} · ${composition} · ${weight} · ${formatInvoiceSar(group.merged.unit_price)} (${group.lines.length} → 1)`;
}

export function ConsolidationSuggestionsPanel({
  lines,
  onApply,
  saving,
}: {
  lines: CustomerInvoiceLine[];
  onApply: (nextLines: CustomerInvoiceLine[]) => Promise<void>;
  saving?: boolean;
}) {
  const groups = useMemo(() => suggestConsolidationGroups(lines), [lines]);

  if (groups.length === 0) return null;

  const lineCountAfter = lines.length - groups.reduce((sum, group) => sum + group.lines.length - 1, 0);

  async function applyGroup(group: ConsolidationGroup) {
    const next = applyConsolidation(lines, [group.key]);
    await onApply(next);
  }

  async function applyAll() {
    const next = applyAllConsolidations(lines);
    await onApply(next);
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-amber-950">Line consolidation suggestions</h3>
          <p className="mt-1 text-sm text-amber-900">
            {lines.length} lines → {lineCountAfter} possible ({groups.length} group
            {groups.length === 1 ? "" : "s"}) — same garment, composition, weight, and unit price
          </p>
        </div>
        <Button size="sm" onClick={() => void applyAll()} disabled={saving}>
          Apply all
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {groups.map((group) => (
          <div key={group.key} className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-sm text-slate-800">{formatGroupLabel(group)}</p>
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
