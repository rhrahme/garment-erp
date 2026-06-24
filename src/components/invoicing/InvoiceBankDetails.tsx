import { getInvoiceBankDetails } from "@/lib/invoicing/bank-details";
import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";

export function InvoiceBankDetails({
  deliveryDestination,
}: {
  deliveryDestination: DeliveryDestination | null | undefined;
}) {
  const bank = getInvoiceBankDetails(deliveryDestination);
  if (!bank) return null;

  return (
    <div className="border-t border-slate-200 pt-4 text-sm text-slate-700">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment details</p>
      <dl className="mt-3 grid gap-1.5 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-500">Beneficiary</dt>
          <dd className="font-medium text-slate-900">{bank.beneficiary}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">IBAN</dt>
          <dd className="font-mono font-medium text-slate-900">{bank.iban}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Bank name</dt>
          <dd>{bank.bank_name}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Branch</dt>
          <dd>{bank.branch_name}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Swift code</dt>
          <dd className="font-mono">{bank.swift_code}</dd>
        </div>
      </dl>
    </div>
  );
}
