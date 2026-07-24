import { PageHeader } from "@/components/ui/PageHeader";
import { ThreadButtonMatchingWorkspace } from "@/components/thread-buttons/ThreadButtonMatchingWorkspace";
import { getSessionContext } from "@/lib/auth/session";

export default async function ThreadButtonsPage() {
  const session = await getSessionContext();
  const canUpdate =
    session.isAdmin ||
    session.isClientManager ||
    session.isTaskOperator ||
    session.isProductionOperator;

  return (
    <div>
      <PageHeader
        title="Thread & buttons"
        description="Match thread and buttons to each fabric article. Tap Confirmed, Missing, or Decision to be taken — statuses are saved with who/when for QC and Production."
      />
      <ThreadButtonMatchingWorkspace readOnly={!canUpdate} />
    </div>
  );
}
