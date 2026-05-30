import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { OrdersList } from "@/components/orders/OrdersList";
import { readSalesOrders, toSalesOrderListRow } from "@/lib/data/sales-orders";

export default function OrdersPage() {
  const orders = readSalesOrders().orders.map(toSalesOrderListRow);

  return (
    <div>
      <PageHeader
        title="Sales Orders"
        description="Client orders — create fabric POs grouped by supplier and send consolidated emails"
        action={
          <Link href="/orders/new">
            <Button>+ New Sales Order</Button>
          </Link>
        }
      />

      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
        <p className="font-medium">Workflow</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-blue-800">
          <li>Create a sales order with client + fabrics</li>
          <li>System groups fabrics by supplier (Caccioppoli, Zegna, Drapers…)</li>
          <li>Review and send one email per supplier</li>
        </ol>
      </div>

      <OrdersList orders={orders} />
    </div>
  );
}
