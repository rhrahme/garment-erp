import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/PageHeader";
import type { LoginEvent } from "@/lib/types/login-events";
import { formatDateTimeRiyadh } from "@/lib/utils";

export function LoginEventsTable({ events }: { events: LoginEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="px-6 py-10 text-center text-sm text-slate-500">
        No login attempts recorded yet. New sign-ins appear here.
      </p>
    );
  }

  return (
        <DataTable
          columns={[
            { key: "when", label: "Time (Riyadh)" },
            { key: "who", label: "Who" },
            { key: "result", label: "Result" },
            { key: "how", label: "How" },
            { key: "device", label: "Device" },
            { key: "ip", label: "IP" },
            { key: "note", label: "Note" },
          ]}
          rows={events.map((row) => ({
            when: formatDateTimeRiyadh(row.at),
            who: (
              <div>
                <p className="font-medium text-slate-800">{row.actor}</p>
                <p className="text-xs text-slate-500">{row.identifier}</p>
              </div>
            ),
            result: (
              <Badge
                className={
                  row.outcome === "success"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-red-200 bg-red-50 text-red-800"
                }
              >
                {row.outcome === "success" ? "Signed in" : "Failed"}
              </Badge>
            ),
            how: row.method === "badge" ? "Badge" : "Email",
            device: row.device,
            ip: <span className="font-mono text-xs text-slate-700">{row.ip}</span>,
            note: <span className="text-xs text-slate-500">{row.error ?? "-"}</span>,
          }))}
        />
  );
}
