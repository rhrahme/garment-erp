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
}: AdminPendingSelectBarProps) {
  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onToggleAll}>
        {allSelected ? "Clear" : `Select all (${total})`}
      </Button>
      <Button
        type="button"
        size="sm"
        className={confirmClassName}
        disabled={busy || selectedCount === 0}
        onClick={onConfirmSelected}
      >
        {`${confirmLabel} selected (${selectedCount})`}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy || selectedCount === 0}
        onClick={onRejectSelected}
      >
        {`${rejectLabel} selected`}
      </Button>
    </div>
  );
}
