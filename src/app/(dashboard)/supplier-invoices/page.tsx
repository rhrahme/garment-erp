import { Suspense } from "react";
import { SupplierInvoicesWorkspace } from "@/components/supplier-invoices/SupplierInvoicesWorkspace";

export default function SupplierInvoicesPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          Loading supplier invoices…
        </div>
      }
    >
      <SupplierInvoicesWorkspace />
    </Suspense>
  );
}
