import { ACTIVITY_TEAM_CHIP_CLASS, ACTIVITY_TEAM_LABEL } from "@/lib/activity/team";
import { formatActivityDateTime } from "@/lib/activity/when";
import type { ActivityEvent } from "@/lib/types/activity-events";

export function OrderActivityTrace({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        No named edits on this order yet. New changes store the person, team, date, and time.
        Every update on the same article stays in this log.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-sm font-semibold text-slate-900">Who did what</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Full log. Several updates on the same article all stay. Date and time are Riyadh.
      </p>
      <div className="mt-3 max-h-[28rem] overflow-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="whitespace-nowrap py-1.5 pr-3 font-medium">Date</th>
              <th className="whitespace-nowrap py-1.5 pr-3 font-medium">Time</th>
              <th className="whitespace-nowrap py-1.5 pr-3 font-medium">Team</th>
              <th className="whitespace-nowrap py-1.5 pr-3 font-medium">Who</th>
              <th className="whitespace-nowrap py-1.5 pr-3 font-medium">Art.</th>
              <th className="py-1.5 font-medium">What</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const when = formatActivityDateTime(event.at);
              return (
                <tr key={event.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap py-1.5 pr-3 font-medium text-slate-900">{when.date}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 font-mono text-slate-700">{when.time}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${ACTIVITY_TEAM_CHIP_CLASS[event.team]}`}
                    >
                      {ACTIVITY_TEAM_LABEL[event.team]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 font-medium text-slate-900">{event.actor_name}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 font-mono text-slate-700">
                    {event.article_label ?? "-"}
                  </td>
                  <td className="py-1.5 text-slate-700">{event.summary}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">{events.length} entries</p>
    </div>
  );
}
