import { PageHeader } from "@/components/ui/PageHeader";
import { PurchasingNav } from "@/components/purchasing/PurchasingNav";
import { SenderEmailSetup } from "@/components/purchasing/SenderEmailSetup";
import { SupplierContactsEditor } from "@/components/purchasing/SupplierContactsEditor";
import { CaccioppoliApiPanel } from "@/components/purchasing/CaccioppoliApiPanel";
import { DrapersApiPanel } from "@/components/purchasing/DrapersApiPanel";
import { ZapierSetup } from "@/components/purchasing/ZapierSetup";
import { getSessionContext } from "@/lib/auth/session";

export default async function SupplierEmailsPage() {
  const session = await getSessionContext();

  return (
    <div>
      <PageHeader
        title="Supplier Emails"
        description="Manage fabric supplier contact details and order email addresses used when sending purchase orders."
      />
      <PurchasingNav />
      <div className="space-y-6">
        {session.canSendSupplierEmails && (
          <>
            <CaccioppoliApiPanel />
            <DrapersApiPanel />
            <SenderEmailSetup />
            <ZapierSetup />
          </>
        )}
        <SupplierContactsEditor />
      </div>
    </div>
  );
}
