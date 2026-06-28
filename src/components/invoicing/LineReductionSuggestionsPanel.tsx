"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import {
  applyAllInvoiceLineReductions,
  applyInvoiceLineReduction,
  detectInvoiceLineReductions,
  lineCountAfterReductions,
  type LineReductionSuggestion,
} from "@/lib/invoicing/line-reduction-suggestions";
import type { CustomerInvoiceLine } from "@/lib/types/customer-invoices";

function formatSuggestionSummary(suggestion: LineReductionSuggestion): string {
  return `${suggestion.from_line_count} → ${suggestion.to_line_count} line${suggestion.to_line_count === 1 ? "" : "s"}: ${suggestion.preview_description}`;
}

export function LineReductionSuggestionsPanel({
  lines,
  onApply,
  onApplyViaApi,
  saving,
}: {
  lines: CustomerInvoiceLine[];
  onApply: (nextLines: CustomerInvoiceLine[]) => Promise<void>;
  /** When set, Apply uses PATCH reduce_lines instead of sending full line list. */
  onApplyViaApi?: (patch: { reduce_lines: "all" } | { reduce_lines: { group_keys: string[] } }) => Promise<void>;
  saving?: boolean;
}) {
  const suggestions = useMemo(() => detectInvoiceLineReductions(lines), [lines]);

  if (suggestions.length === 0) return null;

  const lineCountAfter = lineCountAfterReductions(lines.length, suggestions);

  async function applySuggestion(suggestion: LineReductionSuggestion) {
    if (onApplyViaApi) {
      await onApplyViaApi({ reduce_lines: { group_keys: [suggestion.group_key] } });
      return;
    }
    const next = applyInvoiceLineReduction(lines, suggestion);
    await onApply(next);
  }

  async function applyAll() {
    if (onApplyViaApi) {
      await onApplyViaApi({ reduce_lines: "all" });
      return;
    }
    const next = applyAllInvoiceLineReductions(lines);
    await onApply(next);
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-amber-950">Reduce invoice lines</h3>
          <p className="mt-1 text-sm text-amber-900">
            {lines.length} lines → {lineCountAfter} possible ({suggestions.length} suggestion
            {suggestions.length === 1 ? "" : "s"})
          </p>
        </div>
        <Button size="sm" onClick={() => void applyAll()} disabled={saving}>
          Apply all
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {suggestions.map((suggestion) => (
          <div key={suggestion.group_key} className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-950">{suggestion.title}</p>
              <p className="mt-0.5 text-sm text-amber-900">{suggestion.explanation}</p>
              <p className="mt-1 text-sm text-slate-800">{formatSuggestionSummary(suggestion)}</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0"
              onClick={() => void applySuggestion(suggestion)}
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

/** @deprecated Use LineReductionSuggestionsPanel */
export { LineReductionSuggestionsPanel as ConsolidationSuggestionsPanel };
