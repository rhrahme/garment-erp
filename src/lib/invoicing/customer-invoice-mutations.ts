import {
  generateInvoiceId,
  generateInvoiceNumber,
  readCustomerInvoicesFresh,
  removeCustomerInvoicesByIds,
  saveCustomerInvoice,
} from "@/lib/data/customer-invoices";
import { getSalesOrdersByIdsFresh, readSalesOrdersFresh, writeSalesOrders } from "@/lib/data/sales-orders";
import {
  buildDraftInvoiceFromSalesOrders,
  rebuildInvoiceLinesFromSalesOrders,
  syncInvoiceLinesFromSalesOrder,
  syncInvoiceLinesFromSalesOrders,
} from "@/lib/invoicing/build-invoice";
import { combineCustomerInvoices } from "@/lib/invoicing/combine-invoices";
import { invoiceCoversSalesOrder, invoiceSalesOrderIds } from "@/lib/invoicing/invoice-sales-orders";
import {
  generateInvoicePaymentId,
  getInvoiceAmountPaid,
  getInvoiceBalanceDue,
  normalizeInvoicePayments,
  normalizePaymentMethod,
  roundInvoiceMoney,
  withNormalizedPayments,
} from "@/lib/invoicing/payments";
import { notifyIntegration } from "@/lib/integrations";
import { settleFabricReceivingForSalesOrder } from "@/lib/production/fabric-receiving-settle";
import type {
  CustomerInvoice,
  CustomerInvoicePayment,
  CustomerInvoicePaymentMethod,
  CustomerInvoiceStatus,
} from "@/lib/types/customer-invoices";
import type { SalesOrder } from "@/lib/types/sales-orders";

export async function applyCustomerInvoiceStatusChange(
  invoice: CustomerInvoice,
  status: CustomerInvoiceStatus,
  options?: {
    sent_at?: string | null;
    paid_at?: string | null;
    source?: "erp" | "zapier" | "api";
  }
): Promise<CustomerInvoice> {
  const allowed: CustomerInvoiceStatus[] = ["draft", "sent", "paid"];
  if (!allowed.includes(status)) {
    throw new Error("Invalid invoice status.");
  }

  const current = withNormalizedPayments(invoice);

  if (status === current.status && options?.sent_at === undefined && options?.paid_at === undefined) {
    return current;
  }

  const source = options?.source ?? "erp";
  const next: CustomerInvoice = { ...current, status };

  if (options?.sent_at !== undefined) {
    next.sent_at = options.sent_at;
  } else if (status === "sent" && !next.sent_at) {
    next.sent_at = new Date().toISOString();
  }

  if (options?.paid_at !== undefined) {
    next.paid_at = options.paid_at;
  } else if (status === "paid" && !next.paid_at) {
    next.paid_at = new Date().toISOString();
    if (!next.sent_at) next.sent_at = next.paid_at;
  }

  // Marking paid without a payment ledger: seed a balancing payment when balance remains.
  if (status === "paid") {
    const balance = getInvoiceBalanceDue({ ...next, status: current.status, payments: next.payments });
    if (balance > 0) {
      next.payments = [
        ...next.payments,
        {
          id: generateInvoicePaymentId(),
          amount: balance,
          paid_at: next.paid_at ?? new Date().toISOString(),
          method: null,
          notes: "Marked paid",
          recorded_at: new Date().toISOString(),
          recorded_by: null,
        },
      ];
    }
  }

  if (status === "sent" || status === "paid") {
    const store = await readSalesOrdersFresh();
    const coveredIds = new Set(invoiceSalesOrderIds(invoice));
    let changed = false;
    for (const [orderIndex, order] of store.orders.entries()) {
      if (!coveredIds.has(order.id)) continue;
      store.orders[orderIndex] = { ...order, status: "complete" };
      changed = true;
      await settleFabricReceivingForSalesOrder(order.id, {
        source,
        so_number: order.so_number,
      });
    }
    if (changed) await writeSalesOrders(store);
  }

  const saved = await saveCustomerInvoice(next);

  if (status === "sent" && current.status !== "sent") {
    await notifyIntegration(
      "invoice.sent",
      {
        id: saved.id,
        invoice_number: saved.invoice_number,
        sales_order_id: saved.sales_order_id,
        so_number: saved.so_number,
        client_id: saved.client_id,
        client_code: saved.client_code,
        client_name: saved.client_name,
        total: saved.total,
        currency: saved.currency,
        sent_at: saved.sent_at,
      },
      source
    );
  }

  return saved;
}

export async function recordCustomerInvoicePayment(
  invoice: CustomerInvoice,
  input: {
    amount: number;
    paid_at?: string | null;
    method?: CustomerInvoicePaymentMethod | string | null;
    notes?: string | null;
  },
  actor: string | null,
  source: "erp" | "zapier" | "api" = "erp"
): Promise<{ invoice: CustomerInvoice; payment: CustomerInvoicePayment }> {
  const current = withNormalizedPayments(invoice);
  const amount = roundInvoiceMoney(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const payment: CustomerInvoicePayment = {
    id: generateInvoicePaymentId(),
    amount,
    paid_at: String(input.paid_at || new Date().toISOString().slice(0, 10)),
    method: normalizePaymentMethod(input.method),
    notes: input.notes?.trim() ? input.notes.trim() : null,
    recorded_at: new Date().toISOString(),
    recorded_by: actor,
  };

  let next: CustomerInvoice = {
    ...current,
    payments: [...normalizeInvoicePayments(current.payments), payment],
  };

  const amountPaid = getInvoiceAmountPaid(next);
  const balanceDue = getInvoiceBalanceDue(next);

  if (balanceDue <= 0 && next.status !== "paid") {
    next = await applyCustomerInvoiceStatusChange(next, "paid", { source });
  } else {
    next = await saveCustomerInvoice(next);
  }

  await notifyIntegration(
    "invoice.payment_recorded",
    {
      id: next.id,
      invoice_number: next.invoice_number,
      sales_order_id: next.sales_order_id,
      so_number: next.so_number,
      client_id: next.client_id,
      client_name: next.client_name,
      payment_id: payment.id,
      amount: payment.amount,
      method: payment.method,
      paid_at: payment.paid_at,
      amount_paid: amountPaid,
      balance_due: getInvoiceBalanceDue(next),
      status: next.status,
      recorded_by: actor,
    },
    source
  );

  return { invoice: next, payment };
}

export async function applyCustomerInvoiceLineSync(
  invoice: CustomerInvoice,
  order: SalesOrder | SalesOrder[]
): Promise<CustomerInvoice> {
  const orders = Array.isArray(order) ? order : [order];
  const synced =
    orders.length > 1
      ? syncInvoiceLinesFromSalesOrders(invoice, orders)
      : syncInvoiceLinesFromSalesOrder(invoice, orders[0]!);
  return saveCustomerInvoice(withNormalizedPayments(synced));
}

export async function applyCustomerInvoiceLineRebuild(
  invoice: CustomerInvoice,
  orders: SalesOrder[]
): Promise<CustomerInvoice> {
  const rebuilt = rebuildInvoiceLinesFromSalesOrders(invoice, orders);
  return saveCustomerInvoice(withNormalizedPayments(rebuilt));
}

export async function createCustomerInvoiceFromSalesOrders(
  orders: SalesOrder[],
  actor: string | null,
  source: "erp" | "zapier" | "api" = "erp"
): Promise<CustomerInvoice> {
  const store = await readCustomerInvoicesFresh();
  const already = orders.find((order) =>
    store.invoices.some((invoice) => invoiceCoversSalesOrder(invoice, order.id))
  );
  if (already) {
    const existing = store.invoices.find((invoice) => invoiceCoversSalesOrder(invoice, already.id));
    const error = new Error(`An invoice already exists for ${already.so_number}.`);
    (error as Error & { existingInvoice?: CustomerInvoice }).existingInvoice = existing;
    throw error;
  }
  const draft = buildDraftInvoiceFromSalesOrders(
    orders,
    generateInvoiceNumber(store.invoices),
    generateInvoiceId()
  );
  const saved = await saveCustomerInvoice(draft);
  await notifyIntegration(
    "invoice.created",
    {
      id: saved.id,
      invoice_number: saved.invoice_number,
      sales_order_id: saved.sales_order_id,
      sales_order_ids: invoiceSalesOrderIds(saved),
      so_number: saved.so_number,
      created_by: actor,
      total: saved.total,
    },
    source
  );
  return saved;
}

export async function combineDraftCustomerInvoices(
  invoices: CustomerInvoice[],
  actor: string | null,
  source: "erp" | "zapier" | "api" = "erp",
  /** Sales orders with no invoice yet that land on the same combined invoice. */
  extraOrders: SalesOrder[] = []
): Promise<CustomerInvoice> {
  const coveredOrders = await getSalesOrdersByIdsFresh(
    invoices.flatMap((invoice) => invoiceSalesOrderIds(invoice))
  );
  const allOrders = [
    ...new Map([...coveredOrders, ...extraOrders].map((order) => [order.id, order])).values(),
  ];
  const combined = combineCustomerInvoices(invoices, {
    orderDates: allOrders.map((order) => order.order_date),
  });
  const withOrders =
    extraOrders.length > 0 ? syncInvoiceLinesFromSalesOrders(combined, allOrders) : combined;
  const absorbedIds = invoices.filter((invoice) => invoice.id !== combined.id).map((invoice) => invoice.id);
  const saved = await saveCustomerInvoice(withOrders);
  if (absorbedIds.length > 0) await removeCustomerInvoicesByIds(absorbedIds);
  await notifyIntegration(
    "invoice.updated",
    {
      id: saved.id,
      invoice_number: saved.invoice_number,
      sales_order_id: saved.sales_order_id,
      sales_order_ids: invoiceSalesOrderIds(saved),
      so_number: saved.so_number,
      absorbed_invoice_ids: absorbedIds,
      added_sales_order_ids: extraOrders.map((order) => order.id),
      action: "combined",
      updated_by: actor,
      total: saved.total,
    },
    source
  );
  return saved;
}

/** Fold sales orders that have no invoice yet onto an existing draft. */
export async function addSalesOrdersToCustomerInvoice(
  invoice: CustomerInvoice,
  orders: SalesOrder[],
  actor: string | null,
  source: "erp" | "zapier" | "api" = "erp"
): Promise<CustomerInvoice> {
  if (orders.length === 0) return invoice;
  const covered = await getSalesOrdersByIdsFresh(invoiceSalesOrderIds(invoice));
  const allOrders = [
    ...new Map([...covered, ...orders].map((order) => [order.id, order])).values(),
  ];
  const saved = await saveCustomerInvoice(syncInvoiceLinesFromSalesOrders(invoice, allOrders));
  await notifyIntegration(
    "invoice.updated",
    {
      id: saved.id,
      invoice_number: saved.invoice_number,
      sales_order_id: saved.sales_order_id,
      sales_order_ids: invoiceSalesOrderIds(saved),
      so_number: saved.so_number,
      added_sales_order_ids: orders.map((order) => order.id),
      action: "sales_orders_added",
      updated_by: actor,
      total: saved.total,
    },
    source
  );
  return saved;
}
