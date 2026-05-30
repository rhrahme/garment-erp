import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SupplierInboxWorkspace } from "@/components/supplier-inbox/SupplierInboxWorkspace";

export default function SupplierInboxPage() {
  return (
    <div>
      <PageHeader
        title="Supplier Inbox"
        description="Scan the configured inbox for supplier replies to fabric orders — match POs, invoices, and AWB tracking."
      />
      <Suspense
        fallback={
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
            Loading supplier inbox…
          </div>
        }
      >
        <SupplierInboxWorkspace />
      </Suspense>
    </div>
  );
}
