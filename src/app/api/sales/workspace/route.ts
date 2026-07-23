import { NextResponse } from "next/server";
import { redactCustomerInvoiceCosts } from "@/lib/auth/invoice-cost-access";
import { redactSalesOrderFabricPrices } from "@/lib/auth/fabric-price-access";
import { requireAuthenticated } from "@/lib/auth/session";
import { readClients } from "@/lib/data/clients";
import { readCustomerInvoicesFresh } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readFabricReceipts, readFabricReceiptsArchive } from "@/lib/data/fabric-receipts";
import { readProductionWorkOrders } from "@/lib/data/production-work-orders";
import { readSalesOrders } from "@/lib/data/sales-orders";
import { readSalesWorkspace } from "@/lib/data/sales-workspace";
import {
  filterClientsForSalesBrandScope,
  filterSalesOrdersForSession,
  getAllowedSalesBrandIds,
} from "@/lib/sales/access";
import { deriveSalesMilestone, isSalesAttentionMilestone } from "@/lib/sales/milestones";

export async function GET() {
  const session = await requireAuthenticated();
  if (!session || (!session.isSalesOperator && !session.isAdmin)) {
    return NextResponse.json({ error: "Sales access required." }, { status: 403 });
  }

  await ensureDocumentsLoaded([
    "clients",
    "sales_orders",
    "customer_invoices",
    "sales_workspace",
    "fabric_receipts",
    "fabric_receipts_archive",
    "production_work_orders",
  ]);

  const allowedBrandIds = getAllowedSalesBrandIds(session);
  const allClients = readClients().clients;
  const clients = filterClientsForSalesBrandScope(allClients, allowedBrandIds);
  const clientIds = new Set(clients.map((client) => client.id));
  const orders = filterSalesOrdersForSession(session, readSalesOrders().orders, allClients);
  const orderIds = new Set(orders.map((order) => order.id));
  const workspace = readSalesWorkspace();
  const receipts = [...readFabricReceipts().receipts, ...readFabricReceiptsArchive().receipts];
  const workOrders = readProductionWorkOrders().work_orders;
  const milestoneRows = orders.map((order) => {
    const override = workspace.milestone_overrides.find(
      (item) => item.sales_order_id === order.id
    );
    const milestone = deriveSalesMilestone(order, receipts, workOrders, override);
    return {
      sales_order_id: order.id,
      so_number: order.so_number,
      client_name: order.client_name?.trim() || "—",
      milestone,
      needs_attention:
        isSalesAttentionMilestone(milestone) &&
        override?.alert_acknowledged_milestone !== milestone,
      alert_acknowledged_at: override?.alert_acknowledged_at ?? null,
    };
  });

  const invoiceStore = await readCustomerInvoicesFresh();
  return NextResponse.json({
    allowed_brand_ids: allowedBrandIds,
    clients,
    orders: orders.map(redactSalesOrderFabricPrices),
    invoices: invoiceStore.invoices
      .filter((invoice) => orderIds.has(invoice.sales_order_id))
      .map(redactCustomerInvoiceCosts),
    client_details: workspace.client_details.filter((details) => clientIds.has(details.client_id)),
    fittings: workspace.fittings.filter((fitting) => orderIds.has(fitting.sales_order_id)),
    milestones: milestoneRows,
  });
}
