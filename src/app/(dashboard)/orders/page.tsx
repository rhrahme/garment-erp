import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { OrdersList } from "@/components/orders/OrdersList";
import { readSalesOrders, listBespokeSalesOrders, toSalesOrderListRow } from "@/lib/data/sales-orders";
import { dedupeIdenticalSalesOrders } from "@/lib/sales-orders/duplicate-order";

export default function OrdersPage() {
  const orders = dedupeIdenticalSalesOrders(listBespokeSalesOrders(readSalesOrders().orders)).map(toSalesOrderListRow);

  return (
    <div>
      <PageHeader
        title="Sales Orders"
        description="Bespoke client orders — fabric POs by supplier. Ready-made retail batches are under Ready-Made."
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
