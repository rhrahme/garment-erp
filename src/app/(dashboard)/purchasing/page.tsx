import Link from "next/link";
import { PageHeader, DataTable, StatusBadge } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { PurchasingNav } from "@/components/purchasing/PurchasingNav";
import { EmailPreview } from "@/components/purchasing/EmailPreview";
import { getPurchaseOrders } from "@/lib/data/queries";
import { buildFabricOrderEmail } from "@/lib/fabric-sourcing/email";
import { getFactoryOrdersEmail } from "@/lib/data/supplier-catalogs";
import { getFabricSuppliers } from "@/lib/data/queries";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function PurchasingPage() {
  const orders = await getPurchaseOrders();
  const fabricOrders = orders.filter((o) => o.supplier?.is_fabric_supplier);
  const suppliers = await getFabricSuppliers();
  const caccioppoli = suppliers.find((s) => s.id === "caccioppoli");

  const sampleEmail = buildFabricOrderEmail({
    supplierName: caccioppoli?.name ?? "Caccioppoli",
    supplierEmail: caccioppoli?.email ?? "",
    supplierEmails: caccioppoli?.emails,
    fromEmail: getFactoryOrdersEmail(),
    clientCode: "GL-0526-0001",
    poNumber: "PO-2026-001",
    deliveryDestination: "DXB",
    lines: [
      {
        fabricNumber: "360101",
        quantity: 12,
        unit: "meters",
        labelCount: 2,
        labelStickers: [
          { code: "GL-0526-0001-SO-2026-0001-L01-JKT", piece_name: "Jacket" },
          { code: "GL-0526-0001-SO-2026-0001-L01-TR", piece_name: "Trouser" },
        ],
      },
      {
        fabricNumber: "360122",
        quantity: 8,
        unit: "meters",
        labelCount: 1,
        labelStickers: [{ code: "GL-0526-0001-SO-2026-0001-L02-SHT-LS", piece_name: "Shirt LS" }],
      },
    ],
  });

  return (
    <div>
      <PageHeader
        title="Fabric Orders"
        description="Email suppliers with fabric number, quantity, and client reference — track DHL/AWB on arrival"
        action={
          <Link href="/purchasing/price-lists">
            <Button variant="secondary">View Price Lists</Button>
          </Link>
        }
      />
      <PurchasingNav />

      <div className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Your workflow
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {[
            { step: "1", title: "Look up price", desc: "Find fabric number in supplier price list" },
            { step: "2", title: "Create order", desc: "Qty + client reference per line" },
            { step: "3", title: "Email supplier", desc: "Auto-generated email with all details" },
            { step: "4", title: "Track AWB", desc: "DHL or carrier — linked to this PO" },
          ].map((s) => (
            <div key={s.step} className="rounded-xl border border-slate-200 bg-white p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                {s.step}
              </span>
              <p className="mt-2 font-medium text-slate-900">{s.title}</p>
              <p className="mt-1 text-xs text-slate-500">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Fabric Orders</p>
          <p className="mt-1 text-2xl font-bold">{fabricOrders.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Awaiting Email</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {fabricOrders.filter((o) => !o.emailed_at).length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">In Transit</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">
            {fabricOrders.filter((o) => o.status === "confirmed" || o.status === "sent").length}
          </p>
        </div>
      </div>

      <DataTable
        columns={[
          { key: "po", label: "PO #" },
          { key: "supplier", label: "Supplier" },
          { key: "clientRef", label: "Client Reference" },
          { key: "orderDate", label: "Order Date" },
          { key: "carrier", label: "Carrier" },
          { key: "emailed", label: "Emailed" },
          { key: "amount", label: "Amount" },
          { key: "status", label: "Status" },
        ]}
        rows={fabricOrders.map((o) => ({
          po: <span className="font-medium">{o.po_number}</span>,
          supplier: (
            <div>
              <p className="font-medium">{o.supplier?.name}</p>
              <p className="text-xs text-slate-400">{o.supplier?.email}</p>
            </div>
          ),
          clientRef: o.client_reference ? (
            <span className="font-mono text-xs font-medium text-indigo-700">{o.client_reference}</span>
          ) : "—",
          orderDate: formatDate(o.order_date),
          carrier: o.expected_carrier ?? "DHL",
          emailed: o.emailed_at ? formatDate(o.emailed_at) : (
            <span className="text-amber-600 text-xs font-medium">Not sent</span>
          ),
          amount: formatCurrency(o.total_amount),
          status: <StatusBadge status={o.status} />,
        }))}
      />

      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Sample supplier email</h2>
        <p className="mb-4 text-sm text-slate-500">
          This is what gets generated when you create a fabric order — fabric number, quantity, client reference, and specs from the price list.
        </p>
        <EmailPreview email={sampleEmail} poNumber="PO-2026-001" />
      </div>
    </div>
  );
}
