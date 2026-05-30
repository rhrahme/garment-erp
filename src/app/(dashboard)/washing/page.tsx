import { PageHeader, DataTable, StatusBadge } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { getWashingBatches } from "@/lib/data/queries";
import { formatDate, statusLabel } from "@/lib/utils";

export default async function WashingPage() {
  const batches = await getWashingBatches();

  return (
    <div>
      <PageHeader
        title="Washing"
        description="Fabric pre-wash and garment washing batch management"
        action={<Button>+ Schedule Batch</Button>}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        {(["scheduled", "in_progress", "completed", "rejected"] as const).map((status) => (
          <div key={status} className="rounded-xl border border-slate-200 bg-white p-5">
            <StatusBadge status={status} />
            <p className="mt-2 text-2xl font-bold">
              {batches.filter((b) => b.status === status).length}
            </p>
          </div>
        ))}
      </div>

      <DataTable
        columns={[
          { key: "batch", label: "Batch #" },
          { key: "type", label: "Wash Type" },
          { key: "qty", label: "Quantity" },
          { key: "machine", label: "Machine" },
          { key: "recipe", label: "Recipe" },
          { key: "started", label: "Started" },
          { key: "completed", label: "Completed" },
          { key: "status", label: "Status" },
        ]}
        rows={batches.map((b) => ({
          batch: <span className="font-medium">{b.batch_number}</span>,
          type: statusLabel(b.washing_type),
          qty: b.quantity.toLocaleString(),
          machine: b.machine_id ?? "—",
          recipe: <span className="max-w-xs truncate block text-xs">{b.recipe ?? "—"}</span>,
          started: b.started_at ? formatDate(b.started_at) : "—",
          completed: b.completed_at ? formatDate(b.completed_at) : "—",
          status: <StatusBadge status={b.status} />,
        }))}
      />
    </div>
  );
}
