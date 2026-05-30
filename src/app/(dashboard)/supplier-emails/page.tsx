import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SupplierEmailsWorkspace } from "@/components/supplier-emails/SupplierEmailsWorkspace";

export default function SupplierEmailsPage() {
  return (
    <div>
      <PageHeader
        title="Supplier Emails"
        description="Review and send fabric order emails to suppliers — one email per supplier, grouped from sales orders."
      />
      <Suspense
        fallback={
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
            Loading supplier emails…
          </div>
        }
      >
        <SupplierEmailsWorkspace />
      </Suspense>
    </div>
  );
}
