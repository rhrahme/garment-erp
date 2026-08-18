import { Suspense } from "react";
import { SupplierInvoicesWorkspace } from "@/components/supplier-invoices/SupplierInvoicesWorkspace";
import { canViewMoney } from "@/lib/auth/invoice-amounts-access";
import { getSessionContext } from "@/lib/auth/session";

export default async function SupplierInvoicesPage() {
  const session = await getSessionContext();
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          Loading supplier invoices…
        </div>
      }
    >
      <SupplierInvoicesWorkspace canViewAmounts={canViewMoney(session)} />
    </Suspense>
  );
}
