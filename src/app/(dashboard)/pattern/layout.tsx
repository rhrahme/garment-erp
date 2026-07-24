import { redirect } from "next/navigation";
import { defaultPathForSession } from "@/lib/auth/permissions";
import { getSessionContext } from "@/lib/auth/session";

export default async function PatternLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();
  if (!session.canAccessPattern) {
    redirect(
      defaultPathForSession({
        isClientManager: session.isClientManager,
        isTaskOperator: session.isTaskOperator,
        isProductionOperator: session.isProductionOperator,
        isSalesOperator: session.isSalesOperator,
      })
    );
  }
  return children;
}
