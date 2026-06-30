"use client";

import { useState } from "react";
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

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {mobileNavOpen ? (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <Sidebar
        clientsOnly={clientsOnly}
        isAdmin={session.isAdmin}
        mobileOpen={mobileNavOpen}
        onNavigate={() => setMobileNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header session={session} onMenuClick={() => setMobileNavOpen((open) => !open)} />
        {headerExtra}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
