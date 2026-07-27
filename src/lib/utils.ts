import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

/** Parse ISO dates, EU dates, or Unix timestamps (seconds or ms). */
export function parseFlexibleDate(value: string | number | null | undefined): Date | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 1_000_000_000_000 ? value : value * 1000);
  }
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return new Date(n > 1_000_000_000_000 ? n : n * 1000);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return new Date(trimmed.slice(0, 10));
  const eu = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (eu) {
    const [, d, m, y] = eu;
    return new Date(`${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Human-readable restock / availability date for stock alerts. */
export function formatRestockDate(value: string | number | null | undefined): string | null {
  const date = parseFlexibleDate(value);
  if (!date) return null;
  return formatDate(date);
}

export function formatDateTime(date: string | Date, options?: { timeZone?: string }) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: options?.timeZone,
  }).format(new Date(date));
}

/** Datetime in Asia/Riyadh — primary timezone for factory operations. */
export function formatDateTimeRiyadh(date: string | Date) {
  return formatDateTime(date, { timeZone: "Asia/Riyadh" });
}

export function formatNumber(n: number, decimals = 0) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-emerald-100 text-emerald-700",
  confirmed: "bg-indigo-100 text-indigo-700",
  partial: "bg-amber-100 text-amber-700",
  received: "bg-sky-100 text-sky-700",
  fabric_prep: "bg-amber-100 text-amber-800",
  planned: "bg-slate-100 text-slate-700",
  cancelled: "bg-red-100 text-red-700",
  in_production: "bg-violet-100 text-violet-700",
  shipped: "bg-cyan-100 text-cyan-700",
  delivered: "bg-emerald-100 text-emerald-700",
  cutting: "bg-orange-100 text-orange-700",
  sewing: "bg-blue-100 text-blue-700",
  washing: "bg-teal-100 text-teal-700",
  finishing: "bg-purple-100 text-purple-700",
  packed: "bg-indigo-100 text-indigo-700",
  completed: "bg-emerald-100 text-emerald-700",
  on_hold: "bg-red-100 text-red-700",
  pending: "bg-slate-100 text-slate-700",
  in_transit: "bg-blue-100 text-blue-700",
  out_for_delivery: "bg-cyan-100 text-cyan-700",
  info_received: "bg-slate-100 text-slate-600",
  available_for_pickup: "bg-violet-100 text-violet-700",
  customs: "bg-amber-100 text-amber-700",
  exception: "bg-red-100 text-red-700",
  pass: "bg-emerald-100 text-emerald-700",
  fail: "bg-red-100 text-red-700",
  rework: "bg-amber-100 text-amber-700",
  scheduled: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  rejected: "bg-red-100 text-red-700",
};

export function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
