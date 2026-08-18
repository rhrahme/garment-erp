import { canViewMoney } from "@/lib/auth/invoice-amounts-access";
import type { CustomsSummary } from "@/lib/integrations/customs-summary";
import type { SupplierInvoiceRecord } from "@/lib/integrations/supplier-invoice-store";
import type { TransporterInvoiceRecord } from "@/lib/integrations/transporter-invoice-store";

export type SupplierInvoiceMoneyRow = SupplierInvoiceRecord & {
  transporter_invoices?: TransporterInvoiceRecord[];
  customs_summary?: CustomsSummary;
};

export function redactTransporterInvoiceMoney(
  invoice: TransporterInvoiceRecord
): TransporterInvoiceRecord {
  return { ...invoice, amount: null };
}

export function redactSupplierInvoiceMoney<T extends SupplierInvoiceMoneyRow>(invoice: T): T {
  return {
    ...invoice,
    amount: null,
    transporter_invoices: invoice.transporter_invoices?.map(redactTransporterInvoiceMoney),
    customs_summary: invoice.customs_summary
      ? {
          ...invoice.customs_summary,
          amount_due: null,
          amount_paid: null,
        }
      : invoice.customs_summary,
  };
}

export function supplierInvoiceForSession<T extends SupplierInvoiceMoneyRow>(
  session: { isAdmin?: boolean },
  invoice: T
): T {
  return canViewMoney(session) ? invoice : redactSupplierInvoiceMoney(invoice);
}
