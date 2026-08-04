import { PageHeader, DataTable, StatusBadge } from "@/components/ui/PageHeader";
import {
  NewInspectionButton,
  type WorkOrderOption,
} from "@/components/quality/NewInspectionButton";
import { getQualityInspections, getWorkOrders } from "@/lib/data/queries";
import { formatDate } from "@/lib/utils";

export default async function QualityPage() {
  const [inspections, workOrders] = await Promise.all([
    getQualityInspections(),
    getWorkOrders(),
  ]);

  const workOrderOptions: WorkOrderOption[] = workOrders.slice(0, 200).map((wo) => ({
    id: wo.id,
    label: [wo.wo_number, wo.client_name, wo.style?.name]
      .filter((part) => part && part !== "-")
      .join(" / "),
  }));

  const passCount = inspections.filter((i) => i.result === "pass").length;
  const failCount = inspections.filter((i) => i.result === "fail").length;
  const reworkCount = inspections.filter((i) => i.result === "rework").length;

  return (
    <div>
      <PageHeader
        title="Quality Control"
        description="Inspections, AQL sampling, and defect tracking"
        action={<NewInspectionButton workOrders={workOrderOptions} />}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total Inspections</p>
          <p className="mt-1 text-2xl font-bold">{inspections.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Passed</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{passCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Rework</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{reworkCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Failed</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{failCount}</p>
        </div>
      </div>

      <DataTable
        columns={[
          { key: "date", label: "Date" },
          { key: "wo", label: "Work Order" },
          { key: "sample", label: "Sample Size" },
          { key: "result", label: "Result" },
          { key: "notes", label: "Notes" },
        ]}
        rows={inspections.map((i) => ({
          date: formatDate(i.inspection_date),
          wo: i.work_order_label ?? (i.work_order_id ? `WO-${i.work_order_id}` : "-"),
          sample: i.sample_size,
          result: <StatusBadge status={i.result} />,
          notes: i.notes ?? "-",
        }))}
      />
    </div>
  );
}
