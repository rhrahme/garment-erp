import Link from "next/link";
import {
  ShoppingCart,
  Factory,
  Package,
  Plane,
  ClipboardCheck,
  Users,
  Receipt,
} from "lucide-react";
import { TodaysFabricPanel } from "@/components/dashboard/TodaysFabricPanel";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatusBadge, DataTable } from "@/components/ui/PageHeader";
import {
  getDashboardStats,
  getWorkOrders,
  getShipments,
  getInventory,
} from "@/lib/data/queries";
import { getCustomerInvoiceSummary } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { countInvoiceableSalesOrders } from "@/lib/invoicing/invoiceable-orders";
import { getSessionContext } from "@/lib/auth/session";
import { countPendingAwbFabricOrders } from "@/lib/integrations/pending-awb";
import { getTodaysFabricSummary } from "@/lib/sales-orders/todays-fabric";
import { formatInvoiceSar } from "@/lib/invoicing/format-amount";
import { formatNumber } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await getSessionContext();
  await ensureDocumentsLoaded([
    "customer_invoices",
    "sales_orders",
    "fabric_orders",
    "shipments",
    "costing_rates",
    "production_work_orders",
  ]);

  const [stats, workOrders, shipments, inventory] = await Promise.all([
    getDashboardStats(),
    getWorkOrders(),
    getShipments(),
    getInventory(),
  ]);

  const invoiceSummary = getCustomerInvoiceSummary();
  const readyToInvoice = countInvoiceableSalesOrders();
  const todaysFabricSummary = session.isAdmin ? await getTodaysFabricSummary() : null;
  const pendingAwbCount = session.isAdmin ? countPendingAwbFabricOrders() : 0;

  const lowStock = inventory.filter(
    (i) => i.material && i.quantity_on_hand <= i.material.reorder_level
  );

  const activeWorkOrders = workOrders.filter((wo) => wo.status !== "completed" && wo.status !== "on_hold");

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your garment factory operations"
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Open Sales Orders" value={stats.openSalesOrders} icon={<ShoppingCart className="h-5 w-5" />} accent="bg-violet-50 text-violet-600" />
        <StatCard label="Active Work Orders" value={stats.activeWorkOrders} icon={<Factory className="h-5 w-5" />} accent="bg-blue-50 text-blue-600" />
        <StatCard label="Low Stock Items" value={stats.lowStockItems} icon={<Package className="h-5 w-5" />} accent="bg-red-50 text-red-600" />
        <StatCard label="Inbound Shipments" value={stats.inboundShipments} icon={<Plane className="h-5 w-5" />} accent="bg-cyan-50 text-cyan-600" />
        <StatCard label="Pending QC" value={stats.pendingInspections} icon={<ClipboardCheck className="h-5 w-5" />} accent="bg-amber-50 text-amber-600" />
        <StatCard label="Active Employees" value={stats.totalEmployees} icon={<Users className="h-5 w-5" />} accent="bg-emerald-50 text-emerald-600" />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/invoices" className="block transition-opacity hover:opacity-90">
          <StatCard
            label="Ready to invoice"
            value={readyToInvoice}
            subtext={`${invoiceSummary.draft_count} draft · ${formatInvoiceSar(invoiceSummary.outstanding_sar)} outstanding`}
            icon={<Receipt className="h-5 w-5" />}
            accent="bg-indigo-50 text-indigo-600"
          />
        </Link>
        {session.isAdmin && pendingAwbCount > 0 && (
          <Link href="/shipments" className="block transition-opacity hover:opacity-90">
            <StatCard
              label="Awaiting AWB"
              value={pendingAwbCount}
              subtext="Sent fabric POs — add tracking when supplier dispatches"
              icon={<Plane className="h-5 w-5" />}
              accent="bg-amber-50 text-amber-600"
            />
          </Link>
        )}
      </div>

      {todaysFabricSummary && todaysFabricSummary.order_count > 0 && (
        <TodaysFabricPanel initialSummary={todaysFabricSummary} />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Active Production</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                { key: "wo", label: "Work Order" },
                { key: "style", label: "Style" },
                { key: "progress", label: "Progress" },
                { key: "status", label: "Stage" },
              ]}
              rows={activeWorkOrders.slice(0, 5).map((wo) => ({
                wo: <span className="font-medium">{wo.wo_number}</span>,
                style: wo.style?.style_code ?? "—",
                progress: `${formatNumber(wo.quantity_completed)} / ${formatNumber(wo.quantity_planned)}`,
                status: <StatusBadge status={wo.status} />,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shipment Tracking (AWB)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                { key: "awb", label: "AWB" },
                { key: "carrier", label: "Carrier" },
                { key: "route", label: "Route" },
                { key: "status", label: "Status" },
              ]}
              rows={shipments.slice(0, 5).map((s) => ({
                awb: <span className="font-mono text-xs font-medium">{s.awb_number}</span>,
                carrier: s.carrier ?? "—",
                route: `${s.origin ?? "?"} → ${s.destination ?? "?"}`,
                status: <StatusBadge status={s.status} />,
              }))}
            />
          </CardContent>
        </Card>

        {lowStock.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Low Stock Alerts</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={[
                  { key: "code", label: "Material" },
                  { key: "name", label: "Description" },
                  { key: "onHand", label: "On Hand" },
                  { key: "reorder", label: "Reorder Level" },
                  { key: "due", label: "Est. Stockout" },
                ]}
                rows={lowStock.map((i) => ({
                  code: <span className="font-medium">{i.material?.code}</span>,
                  name: i.material?.name ?? "—",
                  onHand: <span className="text-red-600 font-medium">{formatNumber(i.quantity_on_hand, 0)} {i.material?.unit}</span>,
                  reorder: `${formatNumber(i.material?.reorder_level ?? 0, 0)} ${i.material?.unit}`,
                  due: "—",
                }))}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
