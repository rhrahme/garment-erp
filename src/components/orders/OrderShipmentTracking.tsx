import Link from "next/link";
import { DataTable, StatusBadge } from "@/components/ui/PageHeader";
import { ensureShipmentsLoaded } from "@/lib/integrations/shipment-store";
import { listShipmentsForSalesOrder } from "@/lib/integrations/order-shipments";
import { formatDate } from "@/lib/utils";

type OrderShipmentTrackingProps = {
  salesOrderId: string;
  fabricPoIds?: string[];
};

export async function OrderShipmentTracking({
  salesOrderId,
  fabricPoIds = [],
}: OrderShipmentTrackingProps) {
  await ensureShipmentsLoaded();
  const shipments = listShipmentsForSalesOrder({ salesOrderId, fabricPoIds });

  if (shipments.length === 0) {
    return null;
  }

  const poLinkId =
    shipments.find((shipment) => shipment.purchase_order_id)?.purchase_order_id ??
    fabricPoIds[0] ??
    null;

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Fabric shipment tracking</h2>
          <p className="mt-1 text-sm text-slate-500">
            {shipments.length} inbound AWB{shipments.length !== 1 ? "s" : ""} linked to this order
          </p>
        </div>
        <Link
          href={poLinkId ? `/shipments?po_id=${encodeURIComponent(poLinkId)}` : "/shipments"}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Open shipments →
        </Link>
      </div>

      <DataTable
        columns={[
          { key: "awb", label: "AWB" },
          { key: "carrier", label: "Carrier" },
          { key: "po", label: "Fabric PO" },
          { key: "location", label: "Location" },
          { key: "status", label: "Status" },
        ]}
        rows={shipments.map((shipment) => ({
          awb: (
            <Link
              href={`/shipments?awb=${encodeURIComponent(shipment.awb_number)}`}
              className="font-mono font-medium text-indigo-600 hover:text-indigo-700"
            >
              {shipment.awb_number}
            </Link>
          ),
          carrier: shipment.carrier ?? "—",
          po: shipment.po_number ? (
            <span className="font-mono text-sm">{shipment.po_number}</span>
          ) : (
            "—"
          ),
          location: shipment.current_location ?? shipment.latest_event ?? "—",
          status: (
            <div className="space-y-1">
              <StatusBadge status={shipment.status} />
              {shipment.latest_event_at && (
                <p className="text-xs text-slate-400">
                  {formatDate(shipment.latest_event_at.slice(0, 10))}
                </p>
              )}
            </div>
          ),
        }))}
      />
    </section>
  );
}
