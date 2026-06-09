import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { FabricOrdersList } from "@/components/orders/FabricOrdersList";
import { getSessionContext } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesOrders, listBespokeSalesOrders, toSalesOrderListRow } from "@/lib/data/sales-orders";
import { dedupeIdenticalSalesOrders } from "@/lib/sales-orders/duplicate-order";
import { fabricOrderUiLabels } from "@/lib/orders/fabric-order-ui-labels";

export default async function FabricOrdersPage() {
  const session = await getSessionContext();
  const labels = fabricOrderUiLabels(session.isClientManager);

  await ensureDocumentsLoaded(["sales_orders"]);
  const orders = dedupeIdenticalSalesOrders(listBespokeSalesOrders(readSalesOrders().orders)).map(toSalesOrderListRow);

  return (
    <div>
      <PageHeader
        title={labels.listTitle}
        description={labels.listDescription}
        action={
          <Link href="/fabric-orders/new">
            <Button>{labels.newButton}</Button>
          </Link>
        }
      />

      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
        <p className="font-medium">{labels.workflowTitle}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-blue-800">
          {labels.workflowSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <FabricOrdersList orders={orders} isClientManager={session.isClientManager} />
    </div>
  );
}
