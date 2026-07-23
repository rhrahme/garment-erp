"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { SalesOrder } from "@/lib/types/sales-orders";
import type { SalesFitting, SalesFittingStatus } from "@/lib/types/sales-workspace";

type FittingFilter = "upcoming" | "today" | "past" | "all";

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toISOString().slice(0, 10);
}

function formatDayHeading(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, tomorrow)) return "Tomorrow";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function statusLabel(status: SalesFittingStatus): string {
  if (status === "no_show") return "No-show";
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const FILTERS: { id: FittingFilter; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "today", label: "Today" },
  { id: "past", label: "Past" },
  { id: "all", label: "All" },
];

export function SalesFittingsPanel({
  fittings,
  orders,
  fittingOrderId,
  fittingDate,
  fittingNotes,
  saving,
  onFittingOrderIdChange,
  onFittingDateChange,
  onFittingNotesChange,
  onCreateFitting,
  onUpdateFitting,
}: {
  fittings: SalesFitting[];
  orders: SalesOrder[];
  fittingOrderId: string;
  fittingDate: string;
  fittingNotes: string;
  saving: boolean;
  onFittingOrderIdChange: (value: string) => void;
  onFittingDateChange: (value: string) => void;
  onFittingNotesChange: (value: string) => void;
  onCreateFitting: () => void;
  onUpdateFitting: (
    fittingId: string,
    patch: { status?: SalesFittingStatus; scheduled_at?: string; notes?: string }
  ) => Promise<void>;
}) {
  const [filter, setFilter] = useState<FittingFilter>("upcoming");
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const orderById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);

  const filtered = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const sorted = [...fittings].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

    return sorted.filter((fitting) => {
      const when = new Date(fitting.scheduled_at);
      if (Number.isNaN(when.getTime())) return filter === "all";
      const isToday = isSameDay(when, today);
      const isPast = when < today || fitting.status !== "scheduled";
      const isUpcoming = fitting.status === "scheduled" && when >= today;

      if (filter === "all") return true;
      if (filter === "today") return isToday;
      if (filter === "upcoming") return isUpcoming;
      return isPast && !isUpcoming;
    });
  }, [filter, fittings]);

  const grouped = useMemo(() => {
    const groups = new Map<string, SalesFitting[]>();
    for (const fitting of filtered) {
      const key = dayKey(fitting.scheduled_at);
      const list = groups.get(key) ?? [];
      list.push(fitting);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [filtered]);

  async function patchFitting(
    fittingId: string,
    patch: { status?: SalesFittingStatus; scheduled_at?: string; notes?: string }
  ) {
    setUpdatingId(fittingId);
    try {
      await onUpdateFitting(fittingId, patch);
      if (patch.scheduled_at) {
        setRescheduleId(null);
        setRescheduleValue("");
      }
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Schedule fitting</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select
            value={fittingOrderId}
            onChange={(event) => onFittingOrderIdChange(event.target.value)}
            className="min-h-12 rounded-lg border border-slate-300 px-3"
          >
            {orders.length === 0 ? (
              <option value="">No accessible orders</option>
            ) : (
              orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.so_number} · {order.client_name}
                </option>
              ))
            )}
          </select>
          <input
            type="datetime-local"
            value={fittingDate}
            onChange={(event) => onFittingDateChange(event.target.value)}
            className="min-h-12 rounded-lg border border-slate-300 px-3"
          />
          <input
            value={fittingNotes}
            onChange={(event) => onFittingNotesChange(event.target.value)}
            placeholder="Fitting notes"
            className="min-h-12 rounded-lg border border-slate-300 px-3"
          />
          <Button
            className="min-h-12"
            onClick={onCreateFitting}
            disabled={!fittingDate || !fittingOrderId || saving}
          >
            Schedule fitting
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`min-h-12 rounded-xl px-3 py-3 text-sm font-semibold ${
              filter === item.id
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          No fittings in this view.
        </div>
      ) : (
        grouped.map(([day, dayFittings]) => (
          <div key={day} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {formatDayHeading(day)}
            </h3>
            {dayFittings.map((fitting) => {
              const order = orderById.get(fitting.sales_order_id);
              const busy = updatingId === fitting.id || saving;
              const isEditing = rescheduleId === fitting.id;
              return (
                <div key={fitting.id} className="rounded-xl border bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-slate-900">
                        {order?.client_name?.trim() || "Client"} · Fitting {fitting.sequence_number}
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-indigo-700">
                        {order?.so_number ?? fitting.sales_order_id}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {new Date(fitting.scheduled_at).toLocaleString()} · {statusLabel(fitting.status)}
                      </p>
                      {fitting.notes ? (
                        <p className="mt-1 text-sm text-slate-500">{fitting.notes}</p>
                      ) : null}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <label className="min-w-[14rem] flex-1 text-sm font-medium text-slate-700">
                        New date & time
                        <input
                          type="datetime-local"
                          value={rescheduleValue}
                          onChange={(event) => setRescheduleValue(event.target.value)}
                          className="mt-1 min-h-12 w-full rounded-lg border border-slate-300 px-3"
                        />
                      </label>
                      <Button
                        className="min-h-12"
                        disabled={!rescheduleValue || busy}
                        onClick={() =>
                          void patchFitting(fitting.id, {
                            scheduled_at: new Date(rescheduleValue).toISOString(),
                            status: "scheduled",
                          })
                        }
                      >
                        Save
                      </Button>
                      <Button
                        variant="secondary"
                        className="min-h-12"
                        disabled={busy}
                        onClick={() => {
                          setRescheduleId(null);
                          setRescheduleValue("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {fitting.status === "scheduled" ? (
                        <>
                          <Button
                            className="min-h-12"
                            disabled={busy}
                            onClick={() => void patchFitting(fitting.id, { status: "done" })}
                          >
                            Done
                          </Button>
                          <Button
                            variant="secondary"
                            className="min-h-12"
                            disabled={busy}
                            onClick={() => void patchFitting(fitting.id, { status: "no_show" })}
                          >
                            No-show
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          className="min-h-12"
                          disabled={busy}
                          onClick={() => void patchFitting(fitting.id, { status: "scheduled" })}
                        >
                          Reopen
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        className="min-h-12"
                        disabled={busy}
                        onClick={() => {
                          setRescheduleId(fitting.id);
                          setRescheduleValue(toDatetimeLocalValue(fitting.scheduled_at));
                        }}
                      >
                        Reschedule
                      </Button>
                      {fitting.status !== "cancelled" ? (
                        <Button
                          variant="ghost"
                          className="min-h-12 text-slate-600"
                          disabled={busy}
                          onClick={() => void patchFitting(fitting.id, { status: "cancelled" })}
                        >
                          Cancel fitting
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </section>
  );
}
