"use client";

import { Button } from "@/components/ui/Button";

type AdminPendingSelectBarProps = {
  total: number;
  selectedCount: number;
  allSelected: boolean;
  busy: boolean;
  confirmLabel: string;
  rejectLabel: string;
  confirmClassName?: string;
  onToggleAll: () => void;
  onConfirmSelected: () => void;
  onRejectSelected: () => void;
  onConfirmAll: () => void;
  onRejectAll: () => void;
};

export function AdminPendingSelectBar({
  total,
  selectedCount,
  allSelected,
  busy,
  confirmLabel,
  rejectLabel,
  confirmClassName,
  onToggleAll,
  onConfirmSelected,
  onRejectSelected,
  onConfirmAll,
  onRejectAll,
}: AdminPendingSelectBarProps) {
  if (total === 0) return null;

  const hasSubset = selectedCount > 0 && selectedCount < total;

  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-white p-3 shadow-sm">
      <Button type="button" variant="secondary" disabled={busy} onClick={onToggleAll}>
        {allSelected ? "Clear" : `Select all (${total})`}
      </Button>
      {hasSubset ? (
        <>
          <Button
            type="button"
            className={confirmClassName}
            disabled={busy}
            onClick={onConfirmSelected}
          >
            {`${confirmLabel} selected (${selectedCount})`}
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={onRejectSelected}>
            {`${rejectLabel} selected`}
          </Button>
        </>
      ) : (
        <>
          <Button type="button" className={confirmClassName} disabled={busy} onClick={onConfirmAll}>
            {`${confirmLabel} all (${total})`}
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={onRejectAll}>
            {`${rejectLabel} all`}
          </Button>
        </>
      )}
    </div>
  );
}
