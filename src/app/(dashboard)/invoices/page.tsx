import { PageHeader } from "@/components/ui/PageHeader";
import { CustomerInvoicesWorkspace } from "@/components/invoicing/CustomerInvoicesWorkspace";
import {
  getCustomerInvoiceSummary,
  listCustomerInvoicesSortedFromFile,
  readCustomerInvoicesFresh,
} from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getInvoiceableSalesOrders } from "@/lib/invoicing/invoiceable-orders";

export default async function InvoicesPage() {
  await ensureDocumentsLoaded(["customer_invoices", "sales_orders", "costing_rates", "clients"]);

  const invoicesFile = await readCustomerInvoicesFresh();
  const invoices = listCustomerInvoicesSortedFromFile(invoicesFile);
  const summary = getCustomerInvoiceSummary(invoicesFile);
  const invoiceableOrders = getInvoiceableSalesOrders(50, invoicesFile);

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
