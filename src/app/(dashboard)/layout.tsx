import { DashboardShell } from "@/components/layout/DashboardShell";
import { ExchangeRateBanner } from "@/components/currency/ExchangeRateBanner";
import { SupplierAvailabilityBanner } from "@/components/supplier-inbox/SupplierAvailabilityBanner";
import { AuthHealthBanner } from "@/components/layout/AuthHealthBanner";
import { DocumentsHealthBanner } from "@/components/layout/DocumentsHealthBanner";
import { checkEurSarRateAlert } from "@/lib/currency/rate-alert";
import { getSessionContext } from "@/lib/auth/session";
import { ensureErpBootstrap } from "@/lib/data/document-persistence";

const DEFAULT_RATE_STATUS = {
  bookRate: 4.5,
  alertThreshold: 4.5,
  marketRate: null as number | null,
  aboveThreshold: false,
  alertSent: false,
  checkedAt: new Date().toISOString(),
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Warm ERP cache in the background — pages load only the documents they need.
  void ensureErpBootstrap().catch((error) => {
    console.error("[dashboard layout] ERP bootstrap failed:", error);
  });

  let session: Awaited<ReturnType<typeof getSessionContext>>;
  let rateStatus = DEFAULT_RATE_STATUS;

  try {
    [session, rateStatus] = await Promise.all([
      getSessionContext(),
      checkEurSarRateAlert().catch((error) => {
        console.error("EUR/SAR rate check failed:", error);
        return DEFAULT_RATE_STATUS;
      }),
    ]);
  } catch (error) {
    console.error("[dashboard layout] session lookup failed:", error);
    session = {
      userId: null,
      email: null,
      role: null,
      isSuperAdmin: false,
      isAdmin: false,
      isClientManager: false,
      isTaskOperator: false,
      canViewClientContact: false,
      canViewFabricListPrices: false,
      canAccessPattern: false,
    };
  }
  const headerExtra = (
    <>
      {!session.isClientManager && !session.isTaskOperator && rateStatus.aboveThreshold && rateStatus.marketRate != null && (
        <ExchangeRateBanner
          marketRate={rateStatus.marketRate}
          bookRate={rateStatus.bookRate}
          threshold={rateStatus.alertThreshold}
        />
      )}
      {!session.isClientManager && !session.isTaskOperator && <SupplierAvailabilityBanner />}
      <AuthHealthBanner />
      {session.isAdmin && <DocumentsHealthBanner />}
    </>
  );

  return (
    <DashboardShell session={session} headerExtra={headerExtra}>
      {children}
    </DashboardShell>
  );
}
