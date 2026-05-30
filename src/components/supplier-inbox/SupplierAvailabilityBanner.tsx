import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { countPendingAvailabilityAlerts } from "@/lib/integrations/supplier-availability-store";

export function SupplierAvailabilityBanner() {
  const pendingCount = countPendingAvailabilityAlerts();
  if (pendingCount === 0) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-8 py-3 text-sm text-amber-950">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
        <span>
          <strong>{pendingCount}</strong> fabric{pendingCount === 1 ? "" : "s"} flagged unavailable by a supplier —
          review and choose to wait or replace.
        </span>
        <Link href="/supplier-inbox" className="font-medium text-amber-900 underline hover:text-amber-950">
          Open Supplier Inbox
        </Link>
      </div>
    </div>
  );
}
