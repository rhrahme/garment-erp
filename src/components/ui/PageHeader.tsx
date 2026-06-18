import { Badge } from "./Badge";
import { Card } from "./Card";
import { STATUS_COLORS, statusLabel, cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  accent?: string;
}

export function StatCard({ label, value, subtext, icon, accent = "bg-indigo-50 text-indigo-600" }: StatCardProps) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
          {subtext && <p className="mt-1 text-xs text-slate-400">{subtext}</p>}
        </div>
        {icon && (
          <div className={cn("rounded-lg p-3", accent)}>{icon}</div>
        )}
      </div>
    </Card>
  );
}

interface DataTableProps {
  columns: { key: string; label: string; className?: string }[];
  rows: Record<string, React.ReactNode>[];
  emptyMessage?: string;
}

export function DataTable({ columns, rows, emptyMessage = "No records found." }: DataTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn("px-4 py-3 text-left font-medium text-slate-600", col.className)}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50/50">
              {columns.map((col) => (
                <td key={col.key} className={cn("px-4 py-3 text-slate-700", col.className)}>
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700"}>
      {statusLabel(status)}
    </Badge>
  );
}
