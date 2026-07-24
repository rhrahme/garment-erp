"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const allTabs = [
  { href: "/hr", label: "Payroll Register", payrollOnly: true },
  { href: "/hr/id-badges", label: "ID Badges", payrollOnly: false },
] as const;

export function HrNav({ showPayroll = true }: { showPayroll?: boolean }) {
  const pathname = usePathname();
  const tabs = allTabs.filter((tab) => showPayroll || !tab.payrollOnly);

  if (tabs.length <= 1 && !showPayroll) {
    return null;
  }

  return (
    <div className="mb-6 flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
      {tabs.map(({ href, label }) => {
        const active =
          pathname === href || (href === "/hr/id-badges" && pathname.startsWith("/hr/id-badges/"));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              active ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
