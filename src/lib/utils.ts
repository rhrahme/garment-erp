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

export function formatNumber(n: number, decimals = 0) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
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
