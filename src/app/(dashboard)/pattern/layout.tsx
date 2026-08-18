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
        isStitchOperator: session.isStitchOperator,
        isProductionOperator: session.isProductionOperator,
        isPatternOperator: session.isPatternOperator,
        isSalesOperator: session.isSalesOperator,
        isAccountingOperator: session.isAccountingOperator,
      })
    );
  }

  return (
    <div>
      {session.isPatternOperator && session.actorLabel ? (
        <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          Signed in as <span className="font-semibold">{session.actorLabel}</span>
          {" - "}you and the other pattern operator share this workspace. Every save is tagged
          with your name so admin can see who changed what.
        </div>
      ) : null}
      {children}
    </div>
  );
}
