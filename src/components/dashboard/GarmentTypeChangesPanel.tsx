import Link from "next/link";
import { ArrowRightLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/PageHeader";
import { listGarmentTypeChanges } from "@/lib/data/garment-type-changes";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { formatDateTime } from "@/lib/utils";

export async function GarmentTypeChangesPanel() {
  await ensureDocumentsLoaded(["garment_type_changes"]);
  const changes = listGarmentTypeChanges(15);

  if (changes.length === 0) {
    return null;
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5 text-amber-600" />
          Garment type changes
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <DataTable
          columns={[
            { key: "when", label: "When" },
            { key: "order", label: "Order" },
            { key: "fabric", label: "Fabric" },
            { key: "change", label: "Change" },
            { key: "by", label: "By" },
          ]}
          rows={changes.map((change) => ({
            when: (
              <span className="text-xs text-slate-600">{formatDateTime(change.changed_at)}</span>
            ),
            order: (
              <Link
                href={`/orders/${change.sales_order_id}`}
                className="font-medium text-indigo-700 hover:underline"
              >
                {change.so_number}
              </Link>
            ),
            fabric: (
              <span className="text-sm">
                L{String(change.article_number).padStart(2, "0")} · {change.fabric_number}
              </span>
            ),
            change: (
              <span className="text-sm">
                {change.from_garment_type} → {change.to_garment_type}
              </span>
            ),
            by: <span className="text-xs text-slate-600">{change.changed_by}</span>,
          }))}
        />
      </CardContent>
    </Card>
  );
}
