import { PageHeader } from "@/components/ui/PageHeader";
import { CustomerInvoicesWorkspace } from "@/components/invoicing/CustomerInvoicesWorkspace";
import {
  getCustomerInvoiceSummary,
  listCustomerInvoicesSortedFromFile,
  readCustomerInvoicesFresh,
} from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { withOldestCoveredInvoiceDate } from "@/lib/invoicing/invoice-dates";
import { invoiceSalesOrderIds } from "@/lib/invoicing/invoice-sales-orders";
import { getInvoiceableSalesOrders } from "@/lib/invoicing/invoiceable-orders";
import { getSessionContext } from "@/lib/auth/session";
import { filterSalesOrdersForSession, getAllowedSalesBrandIds } from "@/lib/sales/access";
import { readClients } from "@/lib/data/clients";
import { readSalesOrders } from "@/lib/data/sales-orders";
import {
  customerInvoiceForSession,
  invoiceableOrderForSession,
  redactCustomerInvoiceSummary,
} from "@/lib/auth/invoice-cost-access";
import { canViewMoney } from "@/lib/auth/invoice-amounts-access";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  await ensureDocumentsLoaded(["customer_invoices", "sales_orders", "costing_rates", "clients"]);

  const session = await getSessionContext();
  const invoicesFile = await readCustomerInvoicesFresh();
  const visibleOrders = filterSalesOrdersForSession(
    session,
    readSalesOrders().orders,
    readClients().clients
  );
  const orderIds = new Set(visibleOrders.map((order) => order.id));
  const scopedFile = session.isSalesOperator
    ? {
        ...invoicesFile,
        invoices: invoicesFile.invoices.filter((invoice) =>
          invoiceSalesOrderIds(invoice).some((id) => orderIds.has(id))
        ),
      }
    : invoicesFile;
  const orderDateById = new Map(visibleOrders.map((order) => [order.id, order.order_date]));
  const invoices = listCustomerInvoicesSortedFromFile(scopedFile).map((invoice) =>
    customerInvoiceForSession(
      session,
      withOldestCoveredInvoiceDate(
        invoice,
        invoiceSalesOrderIds(invoice).map((id) => orderDateById.get(id))
      )
    )
  );
  const summary = canViewMoney(session)
    ? getCustomerInvoiceSummary(scopedFile)
    : redactCustomerInvoiceSummary(getCustomerInvoiceSummary(scopedFile));
  const invoiceableOrders = getInvoiceableSalesOrders(50, scopedFile)
    .filter((order) => orderIds.has(order.id))
    .map((order) => invoiceableOrderForSession(session, order));

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
        initialSearch={q ?? ""}
        allowedBrandIds={getAllowedSalesBrandIds(session)}
        canToggleAmounts={session.canToggleInvoiceAmounts}
        amountsVisibleByDefault={session.invoiceAmountsVisibleByDefault}
        revealWithoutPassword={session.canRevealInvoiceAmountsWithoutPassword}
      />
    </div>
  );
}
