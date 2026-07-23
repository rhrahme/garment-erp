import { saveCustomerInvoice } from "@/lib/data/customer-invoices";
import { readSalesOrdersFresh, writeSalesOrders } from "@/lib/data/sales-orders";
import { syncInvoiceLinesFromSalesOrder } from "@/lib/invoicing/build-invoice";
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
    const orderIndex = store.orders.findIndex((order) => order.id === invoice.sales_order_id);
    if (orderIndex >= 0) {
      const order = store.orders[orderIndex]!;
      store.orders[orderIndex] = { ...order, status: "complete" };
      await writeSalesOrders(store);
      await settleFabricReceivingForSalesOrder(order.id, {
        source,
        so_number: order.so_number,
      });
    }
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
  order: SalesOrder
): Promise<CustomerInvoice> {
  const synced = syncInvoiceLinesFromSalesOrder(invoice, order);
  return saveCustomerInvoice(withNormalizedPayments(synced));
}
