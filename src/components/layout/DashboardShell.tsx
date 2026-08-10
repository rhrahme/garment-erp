"use client";

import { useState } from "react";
import { PriceRevealLockOnNavigate } from "@/components/auth/PriceRevealLockOnNavigate";
import { MobileClientPhotosPrompt } from "@/components/layout/MobileClientPhotosPrompt";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import type { SessionContext } from "@/lib/auth/session";

export function DashboardShell({
  children,
  session,
  headerExtra,
}: {
  children: React.ReactNode;
  session: SessionContext;
  headerExtra?: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const clientsOnly = session.isClientManager;
  const taskOperatorOnly = session.isTaskOperator;
  const stitchOperatorOnly = session.isStitchOperator;
  const productionOperatorOnly = session.isProductionOperator;
  const patternOperatorOnly = session.isPatternOperator;
  const salesOperatorOnly = session.isSalesOperator;
  const accountingOperatorOnly = session.isAccountingOperator;
  const kioskMain = stitchOperatorOnly;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 print:h-auto print:max-w-none print:overflow-visible print:w-full">
      <PriceRevealLockOnNavigate />
      <MobileClientPhotosPrompt session={session} />
      {mobileNavOpen ? (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-slate-900/50 md:hidden print:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <Sidebar
        clientsOnly={clientsOnly}
        taskOperatorOnly={taskOperatorOnly}
        stitchOperatorOnly={stitchOperatorOnly}
        productionOperatorOnly={productionOperatorOnly}
        patternOperatorOnly={patternOperatorOnly}
        salesOperatorOnly={salesOperatorOnly}
        accountingOperatorOnly={accountingOperatorOnly}
        isAdmin={session.isAdmin}
        mobileOpen={mobileNavOpen}
        onNavigate={() => setMobileNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden print:max-w-none print:overflow-visible print:w-full">
        <Header session={session} onMenuClick={() => setMobileNavOpen((open) => !open)} />
        {headerExtra}
        {/* overflow-x-hidden makes Chrome tile wide print fragments onto extra pages — must be visible for print */}
        <main
          className={
            kioskMain
              ? "flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 print:max-w-none print:overflow-visible print:p-0 print:w-full"
              : "flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 print:max-w-none print:overflow-visible print:p-0 print:w-full"
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}
