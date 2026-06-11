import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ExchangeRateBanner } from "@/components/currency/ExchangeRateBanner";
import { SupplierAvailabilityBanner } from "@/components/supplier-inbox/SupplierAvailabilityBanner";
import { checkEurSarRateAlert } from "@/lib/currency/rate-alert";
import { getSessionContext } from "@/lib/auth/session";
import { CORE_ERP_DOCUMENT_KEYS } from "@/lib/data/document-keys";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";

/** Warm shared ERP docs once per dashboard request — avoids ColdDocumentCacheError on Vercel. */
const DASHBOARD_LAYOUT_DOCUMENT_KEYS = [
  ...CORE_ERP_DOCUMENT_KEYS,
  "supplier_availability_alerts",
  "fabric_orders",
  "shipments",
  "customer_invoices",
] as const;

const DEFAULT_RATE_STATUS = {
  bookRate: 4.5,
  alertThreshold: 4.5,
  marketRate: null as number | null,
  aboveThreshold: false,
  alertSent: false,
  checkedAt: new Date().toISOString(),
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await ensureDocumentsLoaded(DASHBOARD_LAYOUT_DOCUMENT_KEYS);
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
