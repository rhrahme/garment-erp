import { PageHeader } from "@/components/ui/PageHeader";
import { CustomerInvoicesWorkspace } from "@/components/invoicing/CustomerInvoicesWorkspace";
import {
  getCustomerInvoiceSummary,
  listCustomerInvoicesSortedFromFile,
  readCustomerInvoicesFresh,
} from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getInvoiceableSalesOrders } from "@/lib/invoicing/invoiceable-orders";
import { getSessionContext } from "@/lib/auth/session";
import { filterSalesOrdersForSession, getAllowedSalesBrandIds } from "@/lib/sales/access";
import { readClients } from "@/lib/data/clients";
import { readSalesOrders } from "@/lib/data/sales-orders";
import { redactCustomerInvoiceCosts } from "@/lib/auth/invoice-cost-access";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  await ensureDocumentsLoaded(["customer_invoices", "sales_orders", "costing_rates", "clients"]);

  const session = await getSessionContext();
  const invoicesFile = await readCustomerInvoicesFresh();
  const visibleOrders = filterSalesOrdersForSession(
    session,
    readSalesOrders().orders,
    readClients().clients
  );
  const orderIds = new Set(visibleOrders.map((order) => order.id));
  const visibleFile = session.isSalesOperator
    ? {
        ...invoicesFile,
        invoices: invoicesFile.invoices
          .filter((invoice) => orderIds.has(invoice.sales_order_id))
          .map(redactCustomerInvoiceCosts),
      }
    : invoicesFile;
  const invoices = listCustomerInvoicesSortedFromFile(visibleFile);
  const summary = getCustomerInvoiceSummary(visibleFile);
  const invoiceableOrders = getInvoiceableSalesOrders(50, visibleFile).filter((order) =>
    orderIds.has(order.id)
  );

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
        allowedBrandIds={getAllowedSalesBrandIds(session)}
      />
    </div>
  );
}
