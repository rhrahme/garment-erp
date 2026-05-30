"use client";

import { Check, CloudOff, Loader2 } from "lucide-react";
import type { AutoSaveStatus } from "@/hooks/useAutoSave";

type AutoSaveStatusProps = {
  status: AutoSaveStatus;
  error?: string | null;
  waitingMessage?: string;
  isDirty?: boolean;
  /** remote = saved to server; local = saved in browser storage */
  variant?: "remote" | "local";
};

export function AutoSaveStatusBar({
  status,
  error,
  waitingMessage,
  isDirty,
  variant = "remote",
}: AutoSaveStatusProps) {
  const savedLabel = variant === "local" ? "Draft saved on this device" : "All changes saved";
  const savingLabel = variant === "local" ? "Saving draft…" : "Saving…";
  const savedFlashLabel = variant === "local" ? "Draft saved" : "Saved";
  const pendingLabel = variant === "local" ? "Unsaved draft…" : "Unsaved changes…";

  if (status === "idle" && !isDirty) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Check className="h-3.5 w-3.5" />
        {savedLabel}
      </p>
    );
  }

  if (status === "waiting") {
    return <p className="text-xs text-amber-600">{waitingMessage}</p>;
  }

  if (status === "pending") {
    return <p className="text-xs text-slate-400">{pendingLabel}</p>;
  }

  if (status === "saving") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {savingLabel}
      </p>
    );
  }

  if (status === "saved") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-emerald-600">
        <Check className="h-3.5 w-3.5" />
        {savedFlashLabel}
      </p>
    );
  }

  if (status === "error") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-red-600">
        <CloudOff className="h-3.5 w-3.5" />
        {error ?? "Auto-save failed — keep editing to retry"}
      </p>
    );
  }

  return null;
}
