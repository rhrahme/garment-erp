import { ACTIVITY_TEAM_CHIP_CLASS, ACTIVITY_TEAM_LABEL } from "@/lib/activity/team";
import type { ActivityEvent } from "@/lib/types/activity-events";

function formatWhen(iso: string): string {
  const stamped = Date.parse(iso);
  if (!Number.isFinite(stamped)) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(stamped));
}

export function OrderActivityTrace({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        No named edits on this order yet. New changes store the person and team (QC, Pattern,
        Task, Sales, Admin).
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-sm font-semibold text-slate-900">Who did what</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Name and team chip. Not a row color - one person, not a whole department.
      </p>
      <ul className="mt-3 space-y-2">
        {events.slice(0, 12).map((event) => (
          <li key={event.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${ACTIVITY_TEAM_CHIP_CLASS[event.team]}`}
            >
              {ACTIVITY_TEAM_LABEL[event.team]}
            </span>
            <span className="font-medium text-slate-900">{event.actor_name}</span>
            <span className="text-slate-700">{event.summary}</span>
            <span className="text-xs text-slate-400">{formatWhen(event.at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
