import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, StatusBadge } from "@/components/ui/PageHeader";
import { SalesOrderActions } from "@/components/orders/SalesOrderActions";
import { getSalesOrderById } from "@/lib/data/sales-orders";
import { formatDate } from "@/lib/utils";

export default async function SalesOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = getSalesOrderById(id);
  if (!order) notFound();

  return (
    <div>
      <PageHeader
        title={order.so_number}
        description={
          order.product_article
            ? `${order.client_name} · ${order.product_article} · ${order.client_code}`
            : `${order.client_name} · ${order.client_code}`
        }
        action={
          <Link href="/orders" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            ← All orders
          </Link>
        }
      />

      <div className={`mb-8 grid gap-4 ${order.product_article ? "sm:grid-cols-6" : "sm:grid-cols-5"}`}>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">{order.retail_brand ? "Retail brand" : "Client"}</p>
          <p className="mt-1 font-semibold text-slate-900">{order.client_name}</p>
          <p className="font-mono text-xs text-indigo-600">{order.client_code}</p>
        </div>
        {order.product_article && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-5">
            <p className="text-sm text-violet-700">Article</p>
            <p className="mt-1 font-semibold text-slate-900">{order.product_article}</p>
          </div>
        )}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Order date</p>
          <p className="mt-1 font-semibold text-slate-900">{formatDate(order.order_date)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Ship fabrics to</p>
          <p className="mt-1 font-semibold text-slate-900">
            {order.delivery_destination ?? "Not set"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Delivery date</p>
          <p className="mt-1 font-semibold text-slate-900">
            {order.delivery_date ? formatDate(order.delivery_date) : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Status</p>
          <p className="mt-2">
            <StatusBadge status={order.status} />
          </p>
        </div>
      </div>

      <SalesOrderActions order={order} />
    </div>
  );
}
