import { PageHeader } from "@/components/ui/PageHeader";
import { CustomerInvoicesWorkspace } from "@/components/invoicing/CustomerInvoicesWorkspace";
import { getCustomerInvoiceSummary, listCustomerInvoicesSorted } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getInvoiceableSalesOrders } from "@/lib/invoicing/invoiceable-orders";

export default async function InvoicesPage() {
  await ensureDocumentsLoaded(["customer_invoices", "sales_orders", "costing_rates", "clients"]);

  const invoices = listCustomerInvoicesSorted();
  const summary = getCustomerInvoiceSummary();
  const invoiceableOrders = getInvoiceableSalesOrders(50);

  return (
    <div>
      <PageHeader
        title="Invoicing"
        description="Bill bespoke clients in SAR — create drafts from ready orders, send, and track payment"
      />
      <CustomerInvoicesWorkspace
        invoices={invoices}
        summary={summary}
        invoiceableOrders={invoiceableOrders}
      />
    </div>
  );
}
