import { SuitsYoungLookbook } from "@/components/marketing/SuitsYoungLookbook";
import { getSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Print window for the Suits (Young) lookbook - A4, one suit per page. */
export default async function SuitsYoungPrintPage() {
  await getSessionContext();
  return (
    <div className="p-6">
      <SuitsYoungLookbook showPrintButton />
    </div>
  );
}
