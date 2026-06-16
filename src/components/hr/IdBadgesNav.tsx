"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/hr/id-badges/saudis", label: "Saudis" },
  { href: "/hr/id-badges/expats", label: "Expats" },
];

export function IdBadgesNav() {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
      {tabs.map(({ href, label }) => {
        const active = pathname === href;
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
