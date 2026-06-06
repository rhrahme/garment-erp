import { redirect } from "next/navigation";
import { DocumentsLibrary } from "@/components/documents/DocumentsLibrary";
import { PageHeader } from "@/components/ui/PageHeader";
import { getSessionContext } from "@/lib/auth/session";
import { getDocumentsLibrarySnapshot } from "@/lib/data/documents-library";

export default async function DocumentsPage() {
  const session = await getSessionContext();
  if (!session.isAdmin) {
    redirect("/orders");
  }

  const snapshot = await getDocumentsLibrarySnapshot();

  return (
    <div>
      <PageHeader
        title="Documents & Data"
        description="Everything stored for the ERP — live business datasets in Supabase, imported price catalogs, original supplier files, and scanned PDFs"
      />
      <DocumentsLibrary snapshot={snapshot} />
    </div>
  );
}
