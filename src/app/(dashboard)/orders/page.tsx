import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { OrdersList } from "@/components/orders/OrdersList";
import { getSessionContext } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesOrders, listBespokeSalesOrders, toSalesOrderListRow } from "@/lib/data/sales-orders";
import { dedupeIdenticalSalesOrders } from "@/lib/sales-orders/duplicate-order";
import { ordersUiLabels } from "@/lib/orders/ui-labels";

export default async function OrdersPage() {
  const session = await getSessionContext();
  const productionMode = session.isClientManager;
  const labels = ordersUiLabels(productionMode);

  await ensureDocumentsLoaded(["sales_orders"]);
  const orders = dedupeIdenticalSalesOrders(listBespokeSalesOrders(readSalesOrders().orders)).map(toSalesOrderListRow);

  return (
    <div>
      <PageHeader
        title={labels.listTitle}
        description={labels.listDescription}
        action={
          productionMode ? (
            <Link href="/fabric-orders/new?fresh=1">
              <Button>+ New fabric order</Button>
            </Link>
          ) : (
            <Link href="/orders/new">
              <Button>{labels.newButton}</Button>
            </Link>
          )
        }
      />

      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
        <p className="font-medium">{labels.workflowTitle}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-blue-800">
          {labels.workflowSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {productionMode && (
          <p className="mt-3 text-blue-800">
            Add fabrics on{" "}
            <Link href="/fabric-orders" className="font-medium underline">
              Fabric Orders
            </Link>{" "}
            first — then return here to print labels.
          </p>
        )}
      </div>

      <OrdersList orders={orders} productionMode={productionMode} />
    </div>
  );
}
