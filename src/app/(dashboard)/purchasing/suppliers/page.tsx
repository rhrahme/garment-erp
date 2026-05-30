import { PageHeader } from "@/components/ui/PageHeader";
import { PurchasingNav } from "@/components/purchasing/PurchasingNav";
import { SenderEmailSetup } from "@/components/purchasing/SenderEmailSetup";
import { SupplierContactsEditor } from "@/components/purchasing/SupplierContactsEditor";
import { ZapierSetup } from "@/components/purchasing/ZapierSetup";

export default function SupplierEmailsPage() {
  return (
    <div>
      <PageHeader
        title="Supplier Emails"
        description="Manage fabric supplier contact details and order email addresses used when sending purchase orders."
      />
      <PurchasingNav />
      <div className="space-y-6">
        <SenderEmailSetup />
        <ZapierSetup />
        <SupplierContactsEditor />
      </div>
    </div>
  );
}
