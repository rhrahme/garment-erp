import { PageHeader } from "@/components/ui/PageHeader";
import { SalesOrderForm } from "@/components/orders/SalesOrderForm";

export default function NewSalesOrderPage() {
  return (
    <div>
      <PageHeader
        title="New Sales Order"
        description="Select a client, add fabrics from supplier price lists — then create one email per supplier."
      />
      <SalesOrderForm />
    </div>
  );
}
