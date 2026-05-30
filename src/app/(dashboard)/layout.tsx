import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ExchangeRateBanner } from "@/components/currency/ExchangeRateBanner";
import { SupplierAvailabilityBanner } from "@/components/supplier-inbox/SupplierAvailabilityBanner";
import { checkEurSarRateAlert } from "@/lib/currency/rate-alert";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const rateStatus = await checkEurSarRateAlert();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        {rateStatus.aboveThreshold && rateStatus.marketRate != null && (
          <ExchangeRateBanner
            marketRate={rateStatus.marketRate}
            bookRate={rateStatus.bookRate}
            threshold={rateStatus.alertThreshold}
          />
        )}
        <SupplierAvailabilityBanner />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
