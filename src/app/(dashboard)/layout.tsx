import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ExchangeRateBanner } from "@/components/currency/ExchangeRateBanner";
import { SupplierAvailabilityBanner } from "@/components/supplier-inbox/SupplierAvailabilityBanner";
import { checkEurSarRateAlert } from "@/lib/currency/rate-alert";
import { getSessionContext } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";

const DEFAULT_RATE_STATUS = {
  bookRate: 4.5,
  alertThreshold: 4.5,
  marketRate: null as number | null,
  aboveThreshold: false,
  alertSent: false,
  checkedAt: new Date().toISOString(),
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await ensureDocumentsLoaded(["exchange_rate_state", "supplier_availability_alerts"]);
  const session = await getSessionContext();
  let rateStatus = DEFAULT_RATE_STATUS;
  try {
    rateStatus = await checkEurSarRateAlert();
  } catch (error) {
    console.error("EUR/SAR rate check failed:", error);
  }
  const clientsOnly = session.isClientManager;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar clientsOnly={clientsOnly} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header session={session} />
        {!clientsOnly && rateStatus.aboveThreshold && rateStatus.marketRate != null && (
          <ExchangeRateBanner
            marketRate={rateStatus.marketRate}
            bookRate={rateStatus.bookRate}
            threshold={rateStatus.alertThreshold}
          />
        )}
        {!clientsOnly && <SupplierAvailabilityBanner />}
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
